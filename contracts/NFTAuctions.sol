//SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./interfaces/INFTCollectionManager.sol";
import "./interfaces/ISalesService.sol";

/// @title NFT Marketplace's Auction support
/// @author Flavio Brassesco
/// @dev Users are required to send msg.value when creating a bid. Only max bid gets stored.
/// Users can't cancel bids, bids can only get cancelled once another higher bid is created.
/// Users can't cancel an auction and higher bid always gets the NFT.
/// Users must retrieve their money manually by calling retrievePendingFunds()
contract NFTAuctions is
    ERC2771Context,
    ReentrancyGuard,
    Ownable,
    Pausable,
    ERC721Holder
{
    using EnumerableSet for EnumerableSet.UintSet;

    struct Item {
        address seller;
        address currentBidder;
        uint256 currentBid;
        uint256 endsAt;
    }

    mapping(address => mapping(uint256 => Item)) public items;
    mapping(address => mapping(address => EnumerableSet.UintSet))
        internal _userTokenIds;
    mapping(address => EnumerableSet.UintSet) internal _collectionTokenIds;

    uint256 internal MAX_DAYS;
    INFTCollectionManager internal CollectionManager;
    ISalesService internal SalesService;

    event ItemCreated(
        address indexed seller,
        address indexed collectionAddress,
        uint256 indexed tokenId,
        uint256 price,
        uint256 endsAt
    );

    event ItemTransferred(
        address from,
        address indexed to,
        address indexed collectionAddress,
        uint256 indexed tokenId,
        uint256 price,
        bool sold
    );

    event BidCreated(
        address indexed currentBidder,
        address indexed collectionAddress,
        uint256 indexed tokenId,
        uint256 currentBid,
        uint256 endsAt
    );

    constructor(
        uint256 maxDays_,
        address collectionManager_,
        address salesService_,
        address trustedForwarder_
    ) ERC2771Context(trustedForwarder_) {
        MAX_DAYS = maxDays_;
        CollectionManager = INFTCollectionManager(collectionManager_);
        SalesService = ISalesService(salesService_);
    }

    function createItem(
        address collectionAddress_,
        uint256 tokenId_,
        uint256 floorPrice_,
        uint256 days_
    ) public nonReentrant whenNotPaused {
        onlyWhitelisted(collectionAddress_);
        require(floorPrice_ > 0, "Floor price must be > 0");
        require(days_ >= 1 && days_ <= MAX_DAYS, "Duration out of bounds");

        _addItem(
            _msgSender(),
            collectionAddress_,
            tokenId_,
            floorPrice_,
            days_
        );

        emit ItemCreated(
            _msgSender(),
            collectionAddress_,
            tokenId_,
            floorPrice_,
            block.timestamp + (days_ * 24 * 60 * 60)
        );
        //NFT transfer from msg sender to this contract
        IERC721(collectionAddress_).safeTransferFrom(
            _msgSender(),
            address(this),
            tokenId_
        );
    }

    function bid(
        address collectionAddress_,
        uint256 tokenId_,
        address erc20Address_,
        uint256 amountIn_
    ) public payable nonReentrant whenNotPaused {
        require(
            items[collectionAddress_][tokenId_].seller != _msgSender(),
            "Seller is not authorized"
        );
        require(
            _msgSender() != items[collectionAddress_][tokenId_].currentBidder,
            "Current bidder is not authorized"
        );
        require(
            items[collectionAddress_][tokenId_].endsAt > 0 &&
                block.timestamp < items[collectionAddress_][tokenId_].endsAt,
            "Timestamp out of range"
        );

        Item memory auctionItem = items[collectionAddress_][tokenId_];

        uint256 result;
        if (msg.value > 0) {
            result = SalesService.approvePayment{value: msg.value}(
                address(this),
                msg.value,
                0
            );
        } else {
            result = SalesService.approvePaymentERC20(
                _msgSender(),
                address(this),
                erc20Address_,
                amountIn_,
                amountIn_,
                0
            );
        }

        if (auctionItem.currentBidder == address(0)) {
            require(
                result >= auctionItem.currentBid,
                "Your bid must be >= than floor price"
            );
        } else {
            require(
                result > auctionItem.currentBid,
                "Your bid must be higher than last bid"
            );
        }

        _addBid(collectionAddress_, tokenId_, _msgSender(), result);
    }

    function finishAuction(address collectionAddress_, uint256 tokenId_)
        public
        nonReentrant
    {
        require(
            items[collectionAddress_][tokenId_].endsAt > 0 &&
                block.timestamp > items[collectionAddress_][tokenId_].endsAt,
            "Auction must be finished"
        );
        if (
            items[collectionAddress_][tokenId_].seller == _msgSender() ||
            items[collectionAddress_][tokenId_].currentBidder == _msgSender()
        ) {
            _finishAuction(collectionAddress_, tokenId_);
        } else {
            revert("Only Auction participants allowed");
        }
    }

    function itemOfUserByIndex(
        address user_,
        address collectionAddress_,
        uint256 index_
    ) public view  returns (
            address seller,
            address currentBidder,
            uint256 currentBid,
            uint256 endsAt,
            address collectionAddress,
            uint256 tokenId
        ) {
        require(
            index_ < _userTokenIds[user_][collectionAddress_].length(),
            "Index out of bounds"
        );
        tokenId = _userTokenIds[user_][collectionAddress_].at(index_);
        Item memory item = items[collectionAddress_][tokenId];
        return (
            item.seller,
            item.currentBidder,
            item.currentBid,
            item.endsAt,
            collectionAddress,
            tokenId
        );
    }

    function getUserItemsCount(address user_, address collectionAddress_)
        public
        view
        returns (uint256)
    {
        return _userTokenIds[user_][collectionAddress_].length();
    }

    function itemByIndex(address collectionAddress_, uint256 index_)
        public
        view
        returns (
            address seller,
            address currentBidder,
            uint256 currentBid,
            uint256 endsAt,
            address collectionAddress,
            uint256 tokenId
        )
    {
        require(
            index_ < _collectionTokenIds[collectionAddress_].length(),
            "Index out of bounds"
        );
        tokenId = _collectionTokenIds[collectionAddress_].at(index_);
        Item memory item = items[collectionAddress_][tokenId];
        return (
            item.seller,
            item.currentBidder,
            item.currentBid,
            item.endsAt,
            collectionAddress,
            tokenId
        );
    }

    function getAllItemsCount(address collectionAddress_)
        public
        view
        returns (uint256)
    {
        return _collectionTokenIds[collectionAddress_].length();
    }

    function setPanicSwitch(bool status_) public onlyOwner {
        if (status_) {
            Pausable._pause();
        } else {
            Pausable._unpause();
        }
    }

    function _addItem(
        address user_,
        address collectionAddress_,
        uint256 tokenId_,
        uint256 floorPrice_,
        uint256 days_
    ) internal {
        _userTokenIds[user_][collectionAddress_].add(tokenId_);
        _collectionTokenIds[collectionAddress_].add(tokenId_);
        items[collectionAddress_][tokenId_] = Item(
            user_,
            address(0),
            floorPrice_,
            block.timestamp + (days_ * 24 * 60 * 60)
        );
    }

    function _destroyItem(
        address sender_,
        address collectionAddress_,
        uint256 tokenId_
    ) internal {
        _userTokenIds[sender_][collectionAddress_].remove(tokenId_);
        _collectionTokenIds[collectionAddress_].remove(tokenId_);
        delete items[collectionAddress_][tokenId_];
    }

    function _addBid(
        address collectionAddress_,
        uint256 tokenId_,
        address bidder_,
        uint256 bid_
    ) internal {
        // saving information to make external call after state change
        address previousBidder = items[collectionAddress_][tokenId_]
            .currentBidder;
        uint256 previousBid = items[collectionAddress_][tokenId_].currentBid;

        items[collectionAddress_][tokenId_].currentBid = bid_;
        items[collectionAddress_][tokenId_].currentBidder = bidder_;
        //if remaining days for auction to end are < 1, then reset endsAt to now + 1 day;
        uint256 remainingSeconds = (items[collectionAddress_][tokenId_].endsAt -
            block.timestamp);
        if (remainingSeconds < 86400) {
            items[collectionAddress_][tokenId_].endsAt =
                block.timestamp +
                1 days;
        }

        emit BidCreated(
            items[collectionAddress_][tokenId_].currentBidder,
            collectionAddress_,
            tokenId_,
            items[collectionAddress_][tokenId_].currentBid,
            items[collectionAddress_][tokenId_].endsAt
        );

        // if it is not the first bid
        if (previousBidder != address(0)) {
            SalesService.unlockPendingRevenue(previousBidder, previousBid, 0);
        }
    }

    function _finishAuction(address collectionAddress_, uint256 tokenId_)
        internal
    {
        Item memory auctionItem = items[collectionAddress_][tokenId_];
        address to;
        bool sold;

        // if there is an offer after auction ended
        if (auctionItem.currentBidder != address(0)) {
            to = auctionItem.currentBidder;
            sold = true;
            SalesService.unlockPendingRevenue(
                auctionItem.seller,
                auctionItem.currentBid,
                CollectionManager.getFee(collectionAddress_)
            );
        } else {
            // is not sold so we return the NFT.
            to = auctionItem.seller;
            sold = false;
        }

        emit ItemTransferred(
            auctionItem.seller,
            to,
            collectionAddress_,
            tokenId_,
            auctionItem.currentBid,
            sold
        );

        _destroyItem(auctionItem.seller, collectionAddress_, tokenId_);

        IERC721(collectionAddress_).safeTransferFrom(
            address(this),
            to,
            tokenId_
        );
    }

    function _msgSender()
        internal
        view
        virtual
        override(Context, ERC2771Context)
        returns (address sender)
    {
        return ERC2771Context._msgSender();
    }

    function _msgData()
        internal
        view
        virtual
        override(Context, ERC2771Context)
        returns (bytes calldata)
    {
        return ERC2771Context._msgData();
    }

    function onlyWhitelisted(address collectionAddress_) internal view {
        require(
            CollectionManager.isWhitelistedCollection(collectionAddress_),
            "Contract is not whitelisted"
        );
    }
}
