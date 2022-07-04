//SPDX-License-Identifier: GNU GPLv3 
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockWeth is ERC20, Ownable {
  constructor() ERC20("MockWeth", "MWETH") {}

  function deposit() public payable {
    require(msg.value > 0);
    _mint(_msgSender(), msg.value);
  }

  function withdraw(uint256 amount_) public {
    require(balanceOf(_msgSender()) >= amount_, "Not enough funds");
    require(totalSupply() >= amount_, "Not enough funds");
    _burn(_msgSender(), amount_);
    Address.sendValue(payable(_msgSender()), amount_);
  }
}
