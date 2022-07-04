//SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router01.sol";
import "../interfaces/ISalesService.sol";
import "../libraries/abdk/ABDKMathQuad.sol";

contract SalesService is ISalesService, Ownable, ReentrancyGuard {
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeERC20 for IERC20;

    // set to immutable for testing purposes.
    // You should probably make WETH and UNISWAP_V2_ROUTER constants and declare them at compile time
    address internal immutable UNISWAP_V2_ROUTER; // (Uniswap, Quickswap, Pancakeswap)
    address public immutable override WETH; // (WETH, WMATIC, WBNB)
    address public constant override BASE_CURRENCY = address(0); // use SalesServiceERC20 to make the marketplaces work in BASE_CURRENCY

    EnumerableSet.AddressSet internal _approvedTokens;
    EnumerableSet.AddressSet internal _authorizedMarketplaces;
    mapping(address => uint256) internal _pendingRevenue;
    address payable internal _treasuryAddress;

    event FundsTransferred(address indexed user, uint256 funds);

    constructor(
        address payable treasuryAddress_,
        address weth_,
        address router_
    ) {
        require(
            treasuryAddress_ != address(0),
            "treasury address(0) is not allowed"
        );
        _treasuryAddress = treasuryAddress_;
        WETH = weth_;
        UNISWAP_V2_ROUTER = router_;
    }

    function approvePayment(
        address to_,
        uint256 price_,
        uint256 feePercentage_
    ) external payable override onlyMarketplace nonReentrant returns (uint256) {
        require(price_ == msg.value, "Not enough funds");

        // if address(this) is the receiver, we lock the payment for later retrieval through _returnPayment(address,uint256)
        if (to_ != address(this)) {
            uint256 fee = _calculateFee(price_, feePercentage_);
            uint256 paymentToSeller = price_ - fee;

            _pendingRevenue[to_] += paymentToSeller;
            _pendingRevenue[_treasuryAddress] += fee;
        }
        return msg.value;
    }

    function approvePaymentERC20(
        address from_,
        address to_,
        address tokenAddress_,
        uint256 amountIn_,
        uint256 price_,
        uint256 feePercentage_
    ) external override onlyMarketplace nonReentrant returns (uint256) {
        require(_approvedTokens.contains(tokenAddress_), "Token not allowed");

        address[] memory path = new address[](2);
        path[0] = tokenAddress_;
        path[1] = WETH;

        uint256[] memory amounts = IUniswapV2Router01(UNISWAP_V2_ROUTER)
            .getAmountsOut(amountIn_, path);
        uint256 amountsOutMin = amounts[path.length - 1];

        require(price_ <= amountsOutMin, "Not enough funds");

        // if address(this) is the receiver, we lock the payment for later retrieval through _returnPayment(address,uint256)
        if (to_ != address(this)) {
            uint256 fee = _calculateFee(price_, feePercentage_);
            uint256 paymentToSeller = price_ - fee;

            _pendingRevenue[to_] += paymentToSeller;
            _pendingRevenue[_treasuryAddress] += fee;
        }

        IERC20(tokenAddress_).transferFrom(from_, address(this), amountIn_);
        IERC20(tokenAddress_).approve(UNISWAP_V2_ROUTER, amountIn_);

        IUniswapV2Router01(UNISWAP_V2_ROUTER).swapExactTokensForETH(
            amountIn_,
            amountsOutMin,
            path,
            address(this),
            block.timestamp
        );

        return amountsOutMin;
    }

    function unlockPendingRevenue(
        address to_,
        uint256 amount_,
        uint256 percentage
    ) external override onlyMarketplace nonReentrant {
        uint256 fee = _calculateFee(amount_, percentage);
        _pendingRevenue[to_] += amount_ - fee;
        _pendingRevenue[_treasuryAddress] += fee;
    }

    function _calculateFee(uint256 amount_, uint256 percentage_)
        internal
        pure
        returns (uint256)
    {
        uint256 fee = ABDKMathQuad.toUInt(
            ABDKMathQuad.div(
                ABDKMathQuad.mul(
                    ABDKMathQuad.fromUInt(percentage_),
                    ABDKMathQuad.fromUInt(amount_)
                ),
                ABDKMathQuad.fromUInt(100)
            )
        );
        return fee;
    }

    function addAuthorizedMarketplace(address marketplaceAddress_)
        external
        onlyOwner
    {
        if (!_authorizedMarketplaces.contains(marketplaceAddress_))
            _authorizedMarketplaces.add(marketplaceAddress_);
    }

    function removeAuthorizedMarketplace(address marketplaceAddress_)
        external
        onlyOwner
    {
        if (_authorizedMarketplaces.contains(marketplaceAddress_))
            _authorizedMarketplaces.remove(marketplaceAddress_);
    }

    function getAuthorizedMarketplaces()
        external
        view
        returns (address[] memory)
    {
        return _authorizedMarketplaces.values();
    }

    function addApprovedToken(address tokenAddress_) external onlyOwner {
        if (!_approvedTokens.contains(tokenAddress_))
            _approvedTokens.add(tokenAddress_);
    }

    function removeApprovedToken(address tokenAddress_) external onlyOwner {
        if (_approvedTokens.contains(tokenAddress_))
            _approvedTokens.remove(tokenAddress_);
    }

    function getApprovedTokens() external view returns (address[] memory) {
        return _approvedTokens.values();
    }

    function retrievePendingRevenue() external override nonReentrant {
        require(_pendingRevenue[_msgSender()] > 0, "No pending revenue");
        uint256 pendingRevenue = _pendingRevenue[_msgSender()];
        delete _pendingRevenue[_msgSender()];
        emit FundsTransferred(payable(_msgSender()), pendingRevenue);
        Address.sendValue(payable(_msgSender()), pendingRevenue);
    }

    function getPendingRevenue(address user_)
        external
        view
        override
        returns (uint256 revenue)
    {
        return _pendingRevenue[user_];
    }

    function setTreasuryAddress(address payable treasuryAddress_)
        external
        onlyOwner
    {
        require(
            treasuryAddress_ != address(0),
            "treasury address(0) is not allowed"
        );
        _treasuryAddress = treasuryAddress_;
    }

    modifier onlyMarketplace() {
        require(
            _authorizedMarketplaces.contains(_msgSender()),
            "Sender not allowed"
        );
        _;
    }

    fallback() external payable {}

    receive() external payable {}
}
