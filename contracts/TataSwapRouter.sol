// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./TataSwapFactory.sol";
import "./TataSwapPool.sol";
import "./TataSwapFeeManager.sol";

interface IWETH {
    function deposit() external payable;
    function transfer(address to, uint256 value) external returns (bool);
    function withdraw(uint256) external;
}

/**
 * @title TataSwapRouter
 * @notice Router for adding/removing liquidity and executing AMM token swaps with slippage and deadline protection.
 */
contract TataSwapRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant BPS_DENOMINATOR = 10_000;

    address public immutable factory;
    address public immutable WETH;
    TataSwapFeeManager public immutable feeManager;

    error Expired();
    error InsufficientAAmount();
    error InsufficientBAmount();
    error InsufficientOutputAmount();
    error ExcessiveInputAmount();
    error PairDoesNotExist();
    error ProtocolPaused();
    error ZeroAmount();

    modifier ensure(uint256 deadline) {
        if (deadline < block.timestamp) revert Expired();
        _;
    }

    modifier whenNotPaused() {
        if (feeManager.paused()) revert ProtocolPaused();
        _;
    }

    constructor(address _factory, address _WETH, address _feeManager) {
        factory = _factory;
        WETH = _WETH;
        feeManager = TataSwapFeeManager(_feeManager);
    }

    receive() external payable {
        assert(msg.sender == WETH);
    }

    function sortTokens(address tokenA, address tokenB) public pure returns (address token0, address token1) {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) public pure returns (uint256 amountB) {
        if (amountA == 0 || reserveA == 0 || reserveB == 0) revert ZeroAmount();
        amountB = (amountA * reserveB) / reserveA;
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public
        view
        returns (uint256 amountOut)
    {
        if (amountIn == 0 || reserveIn == 0 || reserveOut == 0) revert ZeroAmount();
        uint256 swapFeeBps = feeManager.swapFeeBps();
        uint256 amountInWithFee = amountIn * (BPS_DENOMINATOR - swapFeeBps);
        uint256 numerator = amountInWithFee * reserveOut;
        uint256 denominator = (reserveIn * BPS_DENOMINATOR) + amountInWithFee;
        amountOut = numerator / denominator;
    }

    function getAmountsOut(uint256 amountIn, address[] memory path)
        public
        view
        returns (uint256[] memory amounts)
    {
        require(path.length >= 2, "INVALID_PATH");
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i = 0; i < path.length - 1; i++) {
            address pair = TataSwapFactory(factory).getPair(path[i], path[i + 1]);
            if (pair == address(0)) revert PairDoesNotExist();
            (uint112 reserve0, uint112 reserve1,) = TataSwapPool(pair).getReserves();
            (address token0,) = sortTokens(path[i], path[i + 1]);
            (uint256 reserveIn, uint256 reserveOut) =
                path[i] == token0 ? (reserve0, reserve1) : (reserve1, reserve0);
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
        }
    }

    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal returns (uint256 amountA, uint256 amountB, address pair) {
        pair = TataSwapFactory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) {
            pair = TataSwapFactory(factory).createPair(tokenA, tokenB);
        }
        (uint112 reserve0, uint112 reserve1,) = TataSwapPool(pair).getReserves();
        (address token0,) = sortTokens(tokenA, tokenB);
        (uint256 reserveA, uint256 reserveB) =
            tokenA == token0 ? (reserve0, reserve1) : (reserve1, reserve0);

        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                if (amountBOptimal < amountBMin) revert InsufficientBAmount();
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = quote(amountBDesired, reserveB, reserveA);
                if (amountAOptimal < amountAMin) revert InsufficientAAmount();
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    )
        external
        nonReentrant
        whenNotPaused
        ensure(deadline)
        returns (uint256 amountA, uint256 amountB, uint256 liquidity)
    {
        address pair;
        (amountA, amountB, pair) = _addLiquidity(
            tokenA,
            tokenB,
            amountADesired,
            amountBDesired,
            amountAMin,
            amountBMin
        );
        IERC20(tokenA).safeTransferFrom(msg.sender, pair, amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, pair, amountB);
        liquidity = TataSwapPool(pair).mint(to);
    }

    function addLiquidityETH(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountETHMin,
        address to,
        uint256 deadline
    )
        external
        payable
        nonReentrant
        whenNotPaused
        ensure(deadline)
        returns (uint256 amountToken, uint256 amountETH, uint256 liquidity)
    {
        address pair;
        (amountToken, amountETH, pair) = _addLiquidity(
            token,
            WETH,
            amountTokenDesired,
            msg.value,
            amountTokenMin,
            amountETHMin
        );
        IERC20(token).safeTransferFrom(msg.sender, pair, amountToken);
        IWETH(WETH).deposit{value: amountETH}();
        require(IWETH(WETH).transfer(pair, amountETH), "WETH_TRANSFER_FAILED");
        liquidity = TataSwapPool(pair).mint(to);
        if (msg.value > amountETH) {
            (bool ok,) = msg.sender.call{value: msg.value - amountETH}("");
            require(ok, "ETH_REFUND_FAILED");
        }
    }

    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) public nonReentrant whenNotPaused ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = TataSwapFactory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) revert PairDoesNotExist();
        IERC20(pair).safeTransferFrom(msg.sender, pair, liquidity);
        (uint256 amount0, uint256 amount1) = TataSwapPool(pair).burn(to);
        (address token0,) = sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        if (amountA < amountAMin) revert InsufficientAAmount();
        if (amountB < amountBMin) revert InsufficientBAmount();
    }

    function _swap(uint256[] memory amounts, address[] memory path, address _to) internal {
        for (uint256 i = 0; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0,) = sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) =
                input == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
            address to = i < path.length - 2
                ? TataSwapFactory(factory).getPair(output, path[i + 2])
                : _to;
            address pair = TataSwapFactory(factory).getPair(input, output);
            TataSwapPool(pair).swap(amount0Out, amount1Out, to);
        }
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external nonReentrant whenNotPaused ensure(deadline) returns (uint256[] memory amounts) {
        amounts = getAmountsOut(amountIn, path);
        if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutputAmount();
        address pair = TataSwapFactory(factory).getPair(path[0], path[1]);
        IERC20(path[0]).safeTransferFrom(msg.sender, pair, amounts[0]);
        _swap(amounts, path, to);
    }

    function swapExactETHForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    )
        external
        payable
        nonReentrant
        whenNotPaused
        ensure(deadline)
        returns (uint256[] memory amounts)
    {
        require(path[0] == WETH, "INVALID_WETH_PATH");
        amounts = getAmountsOut(msg.value, path);
        if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutputAmount();
        IWETH(WETH).deposit{value: amounts[0]}();
        address pair = TataSwapFactory(factory).getPair(path[0], path[1]);
        require(IWETH(WETH).transfer(pair, amounts[0]), "WETH_TRANSFER_FAILED");
        _swap(amounts, path, to);
    }

    function swapExactTokensForETH(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external nonReentrant whenNotPaused ensure(deadline) returns (uint256[] memory amounts) {
        require(path[path.length - 1] == WETH, "INVALID_WETH_PATH");
        amounts = getAmountsOut(amountIn, path);
        if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutputAmount();
        address pair = TataSwapFactory(factory).getPair(path[0], path[1]);
        IERC20(path[0]).safeTransferFrom(msg.sender, pair, amounts[0]);
        _swap(amounts, path, address(this));
        IWETH(WETH).withdraw(amounts[amounts.length - 1]);
        (bool ok,) = to.call{value: amounts[amounts.length - 1]}("");
        require(ok, "ETH_TRANSFER_FAILED");
    }
}
