// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./TataSwapFeeManager.sol";

/**
 * @title TataSwapPool
 * @notice Constant-product AMM liquidity pool with transparent LP and protocol fee splits.
 * @dev Uses ReentrancyGuard, SafeERC20, and emergency pause delegation via TataSwapFeeManager.
 */
contract TataSwapPool is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MINIMUM_LIQUIDITY = 1_000;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    address public constant BURN_ADDRESS = address(0x000000000000000000000000000000000000dEaD);

    address public immutable factory;
    address public token0;
    address public token1;
    TataSwapFeeManager public feeManager;

    uint112 private reserve0;
    uint112 private reserve1;
    uint32 private blockTimestampLast;

    uint256 public cumulativeProtocolFee0;
    uint256 public cumulativeProtocolFee1;

    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    event Swap(
        address indexed sender,
        uint256 amount0In,
        uint256 amount1In,
        uint256 amount0Out,
        uint256 amount1Out,
        address indexed to
    );
    event Sync(uint112 reserve0, uint112 reserve1);
    event ProtocolFeeTransferred(address indexed receiver, address indexed token, uint256 amount);

    error Forbidden();
    error ProtocolPaused();
    error InsufficientLiquidityMinted();
    error InsufficientLiquidityBurned();
    error InsufficientOutputAmount();
    error InsufficientLiquidity();
    error InvalidTo();
    error InsufficientInputAmount();
    error KInvariantViolation();
    error Overflow();

    modifier whenNotPaused() {
        if (feeManager.paused()) revert ProtocolPaused();
        _;
    }

    constructor() ERC20("TataSwap LP Token", "TATA-LP") {
        factory = msg.sender;
    }

    function initialize(address _token0, address _token1, address _feeManager) external {
        if (msg.sender != factory) revert Forbidden();
        token0 = _token0;
        token1 = _token1;
        feeManager = TataSwapFeeManager(_feeManager);
    }

    function getReserves()
        public
        view
        returns (uint112 _reserve0, uint112 _reserve1, uint32 _blockTimestampLast)
    {
        _reserve0 = reserve0;
        _reserve1 = reserve1;
        _blockTimestampLast = blockTimestampLast;
    }

    function _update(uint256 balance0, uint256 balance1) private {
        if (balance0 > type(uint112).max || balance1 > type(uint112).max) revert Overflow();
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = uint32(block.timestamp % 2 ** 32);
        emit Sync(reserve0, reserve1);
    }

    function mint(address to) external nonReentrant whenNotPaused returns (uint256 liquidity) {
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        uint256 amount0 = balance0 - _reserve0;
        uint256 amount1 = balance1 - _reserve1;

        uint256 _totalSupply = totalSupply();
        if (_totalSupply == 0) {
            uint256 rootK = Math.sqrt(amount0 * amount1);
            if (rootK <= MINIMUM_LIQUIDITY) revert InsufficientLiquidityMinted();
            liquidity = rootK - MINIMUM_LIQUIDITY;
            _mint(BURN_ADDRESS, MINIMUM_LIQUIDITY);
        } else {
            liquidity = Math.min(
                (amount0 * _totalSupply) / _reserve0,
                (amount1 * _totalSupply) / _reserve1
            );
        }
        if (liquidity == 0) revert InsufficientLiquidityMinted();
        _mint(to, liquidity);

        _update(balance0, balance1);
        emit Mint(msg.sender, amount0, amount1);
    }

    function burn(address to)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 amount0, uint256 amount1)
    {
        address _token0 = token0;
        address _token1 = token1;
        uint256 balance0 = IERC20(_token0).balanceOf(address(this));
        uint256 balance1 = IERC20(_token1).balanceOf(address(this));
        uint256 liquidity = balanceOf(address(this));

        uint256 _totalSupply = totalSupply();
        amount0 = (liquidity * balance0) / _totalSupply;
        amount1 = (liquidity * balance1) / _totalSupply;
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidityBurned();

        _burn(address(this), liquidity);
        IERC20(_token0).safeTransfer(to, amount0);
        IERC20(_token1).safeTransfer(to, amount1);

        balance0 = IERC20(_token0).balanceOf(address(this));
        balance1 = IERC20(_token1).balanceOf(address(this));

        _update(balance0, balance1);
        emit Burn(msg.sender, amount0, amount1, to);
    }

    function swap(uint256 amount0Out, uint256 amount1Out, address to) external nonReentrant whenNotPaused {
        if (amount0Out == 0 && amount1Out == 0) revert InsufficientOutputAmount();
        (uint112 _reserve0, uint112 _reserve1,) = getReserves();
        if (amount0Out >= _reserve0 || amount1Out >= _reserve1) revert InsufficientLiquidity();

        address _token0 = token0;
        address _token1 = token1;
        if (to == _token0 || to == _token1 || to == address(0)) revert InvalidTo();

        if (amount0Out > 0) IERC20(_token0).safeTransfer(to, amount0Out);
        if (amount1Out > 0) IERC20(_token1).safeTransfer(to, amount1Out);

        uint256 balance0 = IERC20(_token0).balanceOf(address(this));
        uint256 balance1 = IERC20(_token1).balanceOf(address(this));

        uint256 amount0In = balance0 > (_reserve0 - amount0Out) ? balance0 - (_reserve0 - amount0Out) : 0;
        uint256 amount1In = balance1 > (_reserve1 - amount1Out) ? balance1 - (_reserve1 - amount1Out) : 0;
        if (amount0In == 0 && amount1In == 0) revert InsufficientInputAmount();

        uint256 swapFeeBps = feeManager.swapFeeBps();
        uint256 protocolFeeBps = feeManager.protocolFeeBps();
        address feeReceiver = feeManager.protocolFeeReceiver();

        // Direct protocol fee extraction on input tokens
        if (protocolFeeBps > 0 && feeReceiver != address(0)) {
            if (amount0In > 0) {
                uint256 pFee0 = (amount0In * protocolFeeBps) / BPS_DENOMINATOR;
                if (pFee0 > 0) {
                    IERC20(_token0).safeTransfer(feeReceiver, pFee0);
                    cumulativeProtocolFee0 += pFee0;
                    balance0 -= pFee0;
                    amount0In -= pFee0;
                    emit ProtocolFeeTransferred(feeReceiver, _token0, pFee0);
                }
            }
            if (amount1In > 0) {
                uint256 pFee1 = (amount1In * protocolFeeBps) / BPS_DENOMINATOR;
                if (pFee1 > 0) {
                    IERC20(_token1).safeTransfer(feeReceiver, pFee1);
                    cumulativeProtocolFee1 += pFee1;
                    balance1 -= pFee1;
                    amount1In -= pFee1;
                    emit ProtocolFeeTransferred(feeReceiver, _token1, pFee1);
                }
            }
        }

        uint256 lpFeeBps = swapFeeBps > protocolFeeBps ? swapFeeBps - protocolFeeBps : 0;
        uint256 balance0Adjusted = (balance0 * BPS_DENOMINATOR) - (amount0In * lpFeeBps);
        uint256 balance1Adjusted = (balance1 * BPS_DENOMINATOR) - (amount1In * lpFeeBps);
        if (
            balance0Adjusted * balance1Adjusted <
            uint256(_reserve0) * uint256(_reserve1) * (BPS_DENOMINATOR ** 2)
        ) {
            revert KInvariantViolation();
        }

        _update(balance0, balance1);
        emit Swap(msg.sender, amount0In, amount1In, amount0Out, amount1Out, to);
    }

    function sync() external nonReentrant {
        _update(IERC20(token0).balanceOf(address(this)), IERC20(token1).balanceOf(address(this)));
    }
}
