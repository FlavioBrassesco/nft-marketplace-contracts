//SPDX-License-Identifier: GNU GPLv3 

pragma solidity ^0.8.0;

import "./ContextMixin.sol";
import "./NativeMetaTransactionCalldata.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

/// @title A very simple NFT Minter
/// @author Flavio Brassesco
/// @notice Allows owner() to have an NFT collection compliant with ERC721 Interface
/// @dev metadata is implemented as an URI set with _setTokenURI(). IERC721Metadata compliant. Token metadata is immutable.
contract MockERC721 is
  ERC721URIStorage,
  ERC721Enumerable,
  ContextMixin,
  NativeMetaTransactionCalldata,
  Ownable
{
  using Counters for Counters.Counter;
  Counters.Counter private _tokenIds;

  uint256 internal MAX_SUPPLY;
  uint256 internal _floorPrice;
  string internal CONTRACT_URI;
  string internal BASE_URI;

  constructor(
    string memory _name,
    string memory _symbol,
    string memory _contractURI,
    string memory baseURI_,
    uint256 _maxSupply,
    uint256 floorPrice_
  ) ERC721(_name, _symbol) NativeMetaTransactionCalldata(_name) {
    CONTRACT_URI = _contractURI;
    BASE_URI = baseURI_;
    MAX_SUPPLY = _maxSupply;
    _floorPrice = floorPrice_;
  }

  function tokenURI(uint256 tokenId)
    public
    view
    virtual
    override(ERC721, ERC721URIStorage)
    returns (string memory)
  {
    return ERC721URIStorage.tokenURI(tokenId);
  }

  function _beforeTokenTransfer(
    address from,
    address to,
    uint256 tokenId
  ) internal virtual override(ERC721, ERC721Enumerable) {
    ERC721Enumerable._beforeTokenTransfer(from, to, tokenId);
  }

  function _burn(uint256 tokenId)
    internal
    virtual
    override(ERC721, ERC721URIStorage)
  {
    ERC721URIStorage._burn(tokenId);
  }

  function supportsInterface(bytes4 interfaceId)
    public
    view
    virtual
    override(ERC721, ERC721Enumerable)
    returns (bool)
  {
    return ERC721Enumerable.supportsInterface(interfaceId);
  }

  /// @notice get metadata URI for opensea collection.
  /// @dev be sure to replace return string to correct URI
  function contractURI() public view returns (string memory) {
    return CONTRACT_URI;
  }

  function _baseURI() internal view override(ERC721) returns (string memory) {
    return BASE_URI;
  }

  // This is used instead of msg.sender so transactions could be sent by the original token owner and by OpenSea.
  function _msgSender() internal view override returns (address sender) {
    return ContextMixin.msgSender();
  }

  // Override isApprovedForAll to whitelist OpenSea proxy accounts on Matic
  function isApprovedForAll(address _owner, address _operator)
    public
    view
    override(IERC721, ERC721)
    returns (bool isOperator)
  {
    if (_operator == address(0x58807baD0B376efc12F5AD86aAc70E78ed67deaE)) {
      return true;
    }

    return ERC721.isApprovedForAll(_owner, _operator);
  }

  /// @notice Mint NFTs with associated metadata URI
  /// @param _to address to be the owner of minted NFT
  /// @param _tokenURI associated metadata URI of minted NFT
  function mint(address _to, string memory _tokenURI)
    public
    payable
    returns (uint256)
  {
    if (msgSender() != owner()) {
      require(
        msg.value == _floorPrice,
        "Value sent should be equal to floor price"
      );
    }
    require(
      totalSupply() < MAX_SUPPLY,
      "Maximum supply of tokens already minted."
    );
    uint256 newItemId = _tokenIds.current();
    _tokenIds.increment();
    _mint(_to, newItemId);
    _setTokenURI(newItemId, _tokenURI);
    return newItemId;
  }

  function _transfer(
    address from,
    address to,
    uint256 tokenId
  ) internal virtual override {
    ERC721._transfer(from, to, tokenId);
    assert(ERC721.ownerOf(tokenId) == to);
  }
}
