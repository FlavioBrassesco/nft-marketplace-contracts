//SPDX-License-Identifier: GNU GPLv3
pragma solidity >=0.6.2;

import "@uniswap/v2-periphery/contracts/UniswapV2Router02.sol";

contract MockUniRouter is UniswapV2Router02 {
    constructor(address _factory, address _WETH)
        public
        UniswapV2Router02(_factory, _WETH)
    {}
}
