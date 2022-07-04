//SPDX-License-Identifier: GNU GPLv3 
pragma solidity ^0.8.0;

interface INFTCollectionManager {
  function addWhitelistedCollection(address, bool) external;

  function isWhitelistedCollection(address) external view returns (bool);

  function setFee(address, uint256) external;

  function getFee(address) external view returns (uint256);

  function setFloorPrice(address, uint256) external;

  function getFloorPrice(address) external view returns (uint256);
}
