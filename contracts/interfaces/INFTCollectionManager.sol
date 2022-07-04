//SPDX-License-Identifier: GPLv3GPL-3.0-or-later

interface INFTCollectionManager {
  function addWhitelistedCollection(address, bool) external;

  function isWhitelistedCollection(address) external view returns (bool);

  function setFee(address, uint256) external;

  function getFee(address) external view returns (uint256);

  function setFloorPrice(address, uint256) external;

  function getFloorPrice(address) external view returns (uint256);
}
