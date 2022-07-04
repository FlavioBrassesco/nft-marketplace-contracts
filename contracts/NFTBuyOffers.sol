//SPDX-License-Identifier: GNU GPLv3 
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./interfaces/INFTCollectionManager.sol";
import "./interfaces/ISalesService.sol";

/// @title NFT Marketplace's Buy Offer Support
/// @author Flavio Brassesco
/// @notice Adds support for unsolicited Buy offers in NFT Marketplace
/// @dev Users can post an offer anytime and cancel anytime.
/// Owners can accept an offer anytime (Except if they are running an auction).
/// Offers are stored in a pool and refunded when cancelled.
/// Only bidder is enabled to cancel an offer. Offers don't limit the owner in any case.
/// Buy offers should dissappear from front end in case the owner inits an auction.
/// Is not possible to place a Buy offer for auction items.
contract NFTBuyOffers is
    ERC2771Context,
    ReentrancyGuard,
    Ownable,
    ERC721Holder,
    Pausable
{
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.UintSet;

    mapping(address => mapping(address => EnumerableSet.UintSet))
        internal _userBiddedTokens;
    mapping(address => mapping(address => mapping(uint256 => uint256)))
        internal _userBids;
    mapping(address => mapping(uint256 => EnumerableSet.AddressSet))
        internal _tokenBidders;

    uint256 internal MAX_DAYS;
    INFTCollectionManager internal CollectionManager;
    ISalesService internal SalesService;

    event OfferCreated(
        address indexed bidder,
        address indexed collectionAddress,
        uint256 indexed tokenId,
        uint256 bid
    );

    event OfferStatusChanged(
        address indexed bidder,
        address indexed collectionAddress,
        uint256 indexed tokenId,
        uint256 bid,
        bool accepted
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

    function createOffer(
        address collectionAddress_,
        uint256 tokenId_,
        address erc20Address_,
        uint256 amountIn_
    ) public payable whenNotPaused {
        onlyWhitelisted(collectionAddress_);
        require(
            !_userBiddedTokens[_msgSender()][collectionAddress_].contains(
                tokenId_
            ),
            "You already have an offer for this item"
        );
        
        require(amountIn_  > 0 || msg.value > 0, "Bid must be at least 1 wei");

        uint256 value;
        if (msg.value > 0) {
            value = SalesService.approvePayment{value: msg.value}(address(this), msg.value, 0);
        } else {
            value = SalesService.approvePaymentERC20(
                _msgSender(),
                address(this),
                erc20Address_,
                amountIn_,
                amountIn_,
                0
            );
        }

        _addOffer(_msgSender(), collectionAddress_, tokenId_, value);

        emit OfferCreated(_msgSender(), collectionAddress_, tokenId_, value);
    }

    function cancelOffer(address collectionAddress_, uint256 tokenId_)
        public
        nonReentrant
    {
        require(
            _userBiddedTokens[_msgSender()][collectionAddress_].contains(
                tokenId_
            ),
            "No active offer found"
        );
        uint256 bid = _userBids[_msgSender()][collectionAddress_][tokenId_];
        _destroyOffer(_msgSender(), collectionAddress_, tokenId_);

        emit OfferStatusChanged(
            _msgSender(),
            collectionAddress_,
            tokenId_,
            bid,
            false
        );

        SalesService.unlockPendingRevenue(_msgSender(), bid, 0);
    }

    function acceptOffer(
        address collectionAddress_,
        uint256 tokenId_,
        address bidder_
    ) public nonReentrant {
        require(
            _userBiddedTokens[bidder_][collectionAddress_].contains(tokenId_),
            "No active offer found"
        );
        uint256 bid = _userBids[bidder_][collectionAddress_][tokenId_];
        emit OfferStatusChanged(
            bidder_,
            collectionAddress_,
            tokenId_,
            bid,
            true
        );

        _destroyOffer(bidder_, collectionAddress_, tokenId_);

        SalesService.unlockPendingRevenue(
            _msgSender(),
            bid,
            CollectionManager.getFee(collectionAddress_)
        );
        //NFT transfer. Fails if msg sender is not the owner of NFT.
        IERC721(collectionAddress_).safeTransferFrom(
            _msgSender(),
            bidder_,
            tokenId_
        );
    }

    function offerOfUserByIndex(
        address user_,
        address collectionAddress_,
        uint256 index_
    ) public view returns (uint256 bid) {
        require(
            index_ < _userBiddedTokens[user_][collectionAddress_].length(),
            "User Bid index out of bounds"
        );
        uint256 tokenId = _userBiddedTokens[user_][collectionAddress_].at(index_);
        return _userBids[user_][collectionAddress_][tokenId];
    }

    function getUserOffersCount(address user_, address collectionAddress_)
        public
        view
        returns (uint256)
    {
        return _userBiddedTokens[user_][collectionAddress_].length();
    }

    function offerByIndex(
        address collectionAddress_,
        uint256 tokenId_,
        uint256 index_
    ) public view returns (address user, uint256 bid) {
        require(
            index_ < _tokenBidders[collectionAddress_][tokenId_].length(),
            "Bid index out of bounds"
        );
        user = _tokenBidders[collectionAddress_][tokenId_].at(index_);
        return (user, _userBids[user][collectionAddress_][tokenId_]);
    }

    function getAllOffersCount(address collectionAddress_, uint256 tokenId_)
        public
        view
        returns (uint256)
    {
        return _tokenBidders[collectionAddress_][tokenId_].length();
    }

    function setPanicSwitch(bool status_) public onlyOwner {
        if (status_) {
            Pausable._pause();
        } else {
            Pausable._unpause();
        }
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

    function _addOffer(
        address user_,
        address collectionAddress_,
        uint256 tokenId_,
        uint256 bid_
    ) internal {
        _userBids[user_][collectionAddress_][tokenId_] = bid_;
        _userBiddedTokens[user_][collectionAddress_].add(tokenId_);
        _tokenBidders[collectionAddress_][tokenId_].add(user_);
    }

    function _destroyOffer(
        address user_,
        address collectionAddress_,
        uint256 tokenId_
    ) internal {
        delete _userBids[user_][collectionAddress_][tokenId_];
        _userBiddedTokens[user_][collectionAddress_].remove(tokenId_);
        _tokenBidders[collectionAddress_][tokenId_].remove(user_);
    }

    function onlyWhitelisted(address collectionAddress_) internal view {
        require(
            CollectionManager.isWhitelistedCollection(collectionAddress_),
            "Contract is not whitelisted"
        );
    }
}
