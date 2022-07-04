//SPDX-License-Identifier: GNU GPLv3 
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockERC20 is ERC20, Ownable {
  constructor() ERC20("MockERC20", "M20") {
    ERC20._mint(owner(), 100 ether);
  }
}
