//SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./interfaces/INFTCollectionManager.sol";

contract NFTCollectionManager is INFTCollectionManager, Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.UintSet;

    // collections array
    EnumerableSet.AddressSet internal _collections;
    // collection data
    mapping(address => Collection) internal _collectionData;

    struct Collection {
        uint256 fee;
        uint256 floorPrice;
        bool whitelisted;
    }

    constructor() {}

    /// @notice Adds an NFT Contract address to the marketplace allowed contracts
    /// @param contractAddress_ address of NFT Collection
    function addWhitelistedCollection(address contractAddress_, bool status_)
        public
        override(INFTCollectionManager)
        onlyOwner
    {
        require(
            IERC165(contractAddress_).supportsInterface(
                type(IERC721).interfaceId
            ),
            "Address is not IERC721 compliant"
        );
        if (!_collections.contains(contractAddress_)) {
            _collections.add(contractAddress_);
        }
        _collectionData[contractAddress_].whitelisted = status_;
    }

    /// @notice Returns whitelist status for specified NFT contract address
    function isWhitelistedCollection(address contractAddress_)
        public
        view
        override(INFTCollectionManager)
        returns (bool)
    {
        return _collectionData[contractAddress_].whitelisted;
    }

    /// @notice Set a secondary sales fee for an NFT collection.
    /// @param contractAddress_ address of NFT collection.
    /// @param fee_ secondary sales fee for contractAddress_.
    function setFee(address contractAddress_, uint256 fee_)
        public
        override(INFTCollectionManager)
        onlyOwner
    {
        require(
            _collections.contains(contractAddress_),
            "Collection does not exists in marketplace"
        );
        // Edit this line to change the maximum fee.
        require(fee_ < 51, "Can't set fee higher than 50.00%");
        _collectionData[contractAddress_].fee = fee_;
    }

    /// @notice Returns the secondary sales fee for the specified NFT collection.
    /// @param contractAddress_ address of NFT collection
    /// @return uint256 secondary sales fee.
    function getFee(address contractAddress_)
        public
        view
        override(INFTCollectionManager)
        returns (uint256)
    {
        return _collectionData[contractAddress_].fee;
    }

    /// @notice Set floor price in wei for an NFT collection.
    /// @dev This floor price is only used in createMarketOwnerSale
    /// @param contractAddress_ address of NFT collection
    /// @param floorPrice_ floor price for contractAddress_ in wei
    function setFloorPrice(address contractAddress_, uint256 floorPrice_)
        public
        override(INFTCollectionManager)
        onlyOwner
    {
        require(
            _collections.contains(contractAddress_),
            "Collection does not exists in marketplace"
        );
        require(floorPrice_ > 0, "Floor price must be at least 1 wei");
        _collectionData[contractAddress_].floorPrice = floorPrice_;
    }

    /// @notice Returns the floor price for the specified NFT collection
    /// @param contractAddress_ address of NFT collection
    /// @return uint256 floor price for contractAddress_ in wei
    function getFloorPrice(address contractAddress_)
        public
        view
        override(INFTCollectionManager)
        returns (uint256)
    {
        return _collectionData[contractAddress_].floorPrice;
    }

    function getCollectionsCount() public view returns (uint256) {
        return _collections.length();
    }

    function collectionByIndex(uint256 index_) public view returns(address) {
        return _collections.at(index_);
    }
}
