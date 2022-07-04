//SPDX-License-Identifier: GNU GPLv3

// solhint-disable-next-line
pragma solidity =0.5.16;

import "@uniswap/v2-core/contracts/UniswapV2Factory.sol";

contract MockUniFactory is UniswapV2Factory {
    constructor(address feeToSetter_) public UniswapV2Factory(feeToSetter_) {}
}