//SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "./interfaces/INFTCollectionManager.sol";
import "./interfaces/ISalesService.sol";

/// @title A simple NFT marketplace for collection owners.
/// @author Flavio Brassesco
/// @notice Users can use this marketplace to sell NFTs (ERC721) that are part of collections developed by or allowed by the marketplace owner.
contract NFTMarketplace is
    ERC2771Context,
    ReentrancyGuard,
    Ownable,
    ERC721Holder,
    Pausable
{
    using EnumerableSet for EnumerableSet.UintSet;

    mapping(address => mapping(uint256 => Item)) public items;
    mapping(address => mapping(address => EnumerableSet.UintSet))
        internal _userTokenIds;
    mapping(address => EnumerableSet.UintSet) internal _collectionTokenIds;

    struct Item {
        address seller;
        uint256 price;
    }

    string private _name;
    INFTCollectionManager internal CollectionManager;
    ISalesService internal SalesService;

    event ItemCreated(
        address indexed seller,
        address indexed collectionAddress,
        uint256 indexed tokenId,
        uint256 price
    );

    event ItemUpdated(
        address indexed seller,
        address indexed collectionAddress,
        uint256 indexed tokenId,
        uint256 price
    );

    event ItemTransferred(
        address indexed seller,
        address owner,
        address indexed collectionAddress,
        uint256 indexed tokenId,
        uint256 price
    );

    constructor(
        address collectionManager_,
        address salesService_,
        address trustedForwarder_
    ) ERC2771Context(trustedForwarder_) {
        CollectionManager = INFTCollectionManager(collectionManager_);
        SalesService = ISalesService(salesService_);
    }

    function createItem(
        address collectionAddress_,
        uint256 tokenId_,
        uint256 price_
    ) public nonReentrant whenNotPaused {
        onlyWhitelisted(collectionAddress_);
        require(price_ > 0, "Price must be at least 1 wei");

        _addItem(_msgSender(), collectionAddress_, tokenId_, price_);

        emit ItemCreated(_msgSender(), collectionAddress_, tokenId_, price_);
        //NFT transfer from msg sender to this contract
        IERC721(collectionAddress_).safeTransferFrom(
            _msgSender(),
            address(this),
            tokenId_
        );
    }

    function updateItem(
        address collectionAddress_,
        uint256 tokenId_,
        uint256 price_
    ) public {
        onlySeller(collectionAddress_, tokenId_);
        require(price_ > 0, "Price must be at least 1 wei");
        items[collectionAddress_][tokenId_].price = price_;

        emit ItemUpdated(_msgSender(), collectionAddress_, tokenId_, price_);
    }

    /// @notice Cancels a listed item and returns NFT to seller.
    function cancelItem(address collectionAddress_, uint256 tokenId_)
        public
        nonReentrant
    {
        onlySeller(collectionAddress_, tokenId_);
        emit ItemTransferred(
            _msgSender(),
            _msgSender(),
            collectionAddress_,
            tokenId_,
            items[collectionAddress_][tokenId_].price
        );
        _destroyItem(_msgSender(), collectionAddress_, tokenId_);

        IERC721(collectionAddress_).safeTransferFrom(
            address(this),
            _msgSender(),
            tokenId_
        );
    }

    function buy(
        address collectionAddress_,
        uint256 tokenId_,
        address erc20Address_,
        uint256 amountIn_
    ) public payable nonReentrant whenNotPaused {
        bool marketOwner = false;
        address seller = items[collectionAddress_][tokenId_].seller;
        uint256 price;
        uint256 feePercentage;

        require(seller != _msgSender(), "Seller not allowed");

        // If item is not for sale we try to sell an item from market owner address.
        // This is useful for market owners that already have minted a batch of NFTs to sell,
        // instead of doing a pay-to-mint sale
        if (seller == address(0)) {
            seller = owner();
            price = CollectionManager.getFloorPrice(collectionAddress_);
            feePercentage = 0;
            marketOwner = true;
        } else {
            price = items[collectionAddress_][tokenId_].price;
            feePercentage = CollectionManager.getFee(collectionAddress_);
        }

        emit ItemTransferred(
            seller,
            _msgSender(),
            collectionAddress_,
            tokenId_,
            price
        );

        if (msg.value > 0) {
            SalesService.approvePayment{value: msg.value}(
                seller,
                price,
                feePercentage
            );
        } else {
            SalesService.approvePaymentERC20(
                _msgSender(),
                seller,
                erc20Address_,
                amountIn_,
                price,
                feePercentage
            );
        }
        _sellItem(_msgSender(), collectionAddress_, tokenId_, marketOwner);
    }

    function itemOfUserByIndex(
        address user_,
        address collectionAddress_,
        uint256 index_
    )
        public
        view
        returns (
            address seller,
            uint256 price,
            address collectionAddress,
            uint256 tokenId
        )
    {
        require(
            index_ < _userTokenIds[user_][collectionAddress_].length(),
            "Index out of bounds"
        );
        tokenId = _userTokenIds[user_][collectionAddress_].at(index_);
        Item memory marketItem = items[collectionAddress_][tokenId];
        return (
            marketItem.seller,
            marketItem.price,
            collectionAddress_,
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
            uint256 price,
            address collectionAddress,
            uint256 tokenId
        )
    {
        require(
            index_ < _collectionTokenIds[collectionAddress_].length(),
            "Index out of bounds"
        );
        tokenId = _collectionTokenIds[collectionAddress_].at(index_);
        Item memory marketItem = items[collectionAddress_][tokenId];
        return (
            marketItem.seller,
            marketItem.price,
            collectionAddress_,
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
        address sender_,
        address collectionAddress_,
        uint256 tokenId_,
        uint256 price_
    ) internal {
        _userTokenIds[sender_][collectionAddress_].add(tokenId_);
        _collectionTokenIds[collectionAddress_].add(tokenId_);
        items[collectionAddress_][tokenId_] = Item(sender_, price_);
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

    function _sellItem(
        address to_,
        address collectionAddress_,
        uint256 tokenId_,
        bool isMarketOwner
    ) internal {
        address from = address(this);

        if (isMarketOwner) {
            from = owner();
        } else {
            _destroyItem(
                items[collectionAddress_][tokenId_].seller,
                collectionAddress_,
                tokenId_
            );
        }

        // NFT transfer
        IERC721(collectionAddress_).safeTransferFrom(from, to_, tokenId_);
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

    function onlySeller(address collectionAddress_, uint256 tokenId_)
        internal
        view
    {
        require(
            _msgSender() == items[collectionAddress_][tokenId_].seller,
            "Only seller allowed"
        );
    }

    function onlyWhitelisted(address collectionAddress_) internal view {
        require(
            CollectionManager.isWhitelistedCollection(collectionAddress_),
            "Contract is not whitelisted"
        );
    }
}
