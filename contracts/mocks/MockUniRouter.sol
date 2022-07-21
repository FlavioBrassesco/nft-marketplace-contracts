//SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity >=0.6.2;

import "../deps/v2-periphery/UniswapV2Router02.sol";

contract MockUniRouter is UniswapV2Router02 {
    constructor(address _factory, address _WETH)
        public
        UniswapV2Router02(_factory, _WETH)
    {}
}
