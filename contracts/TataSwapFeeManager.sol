// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title TataSwapFeeManager
 * @notice Manages transparent AMM swap fees, protocol fee share, and emergency pause authority.
 * @dev Never has custody of user LP tokens or pool reserves; only configures fee rates and protocol fee receiver.
 */
contract TataSwapFeeManager is Ownable2Step, Pausable {
    uint256 public constant MAX_TOTAL_FEE_BPS = 100; // 1.00% hard cap to protect traders
    uint256 public constant BPS_DENOMINATOR = 10_000;

    address public protocolFeeReceiver;
    uint256 public swapFeeBps;     // Default 30 bps (0.30%)
    uint256 public protocolFeeBps; // Portion of swapFeeBps sent to protocolFeeReceiver (default 5 bps = 0.05%)

    event ProtocolFeeReceiverUpdated(address indexed previousReceiver, address indexed newReceiver);
    event SwapFeeUpdated(uint256 newSwapFeeBps, uint256 newProtocolFeeBps);

    error ZeroAddress();
    error FeeExceedsMaxCap(uint256 requestedBps, uint256 maxBps);
    error ProtocolFeeExceedsSwapFee(uint256 protocolBps, uint256 swapBps);

    constructor(
        address initialOwner,
        address initialFeeReceiver,
        uint256 initialSwapFeeBps,
        uint256 initialProtocolFeeBps
    ) Ownable(initialOwner) {
        if (initialFeeReceiver == address(0)) revert ZeroAddress();
        if (initialSwapFeeBps > MAX_TOTAL_FEE_BPS) {
            revert FeeExceedsMaxCap(initialSwapFeeBps, MAX_TOTAL_FEE_BPS);
        }
        if (initialProtocolFeeBps > initialSwapFeeBps) {
            revert ProtocolFeeExceedsSwapFee(initialProtocolFeeBps, initialSwapFeeBps);
        }

        protocolFeeReceiver = initialFeeReceiver;
        swapFeeBps = initialSwapFeeBps;
        protocolFeeBps = initialProtocolFeeBps;

        emit ProtocolFeeReceiverUpdated(address(0), initialFeeReceiver);
        emit SwapFeeUpdated(initialSwapFeeBps, initialProtocolFeeBps);
    }

    function setProtocolFeeReceiver(address newReceiver) external onlyOwner {
        if (newReceiver == address(0)) revert ZeroAddress();
        address old = protocolFeeReceiver;
        protocolFeeReceiver = newReceiver;
        emit ProtocolFeeReceiverUpdated(old, newReceiver);
    }

    function setSwapFees(uint256 newSwapFeeBps, uint256 newProtocolFeeBps) external onlyOwner {
        if (newSwapFeeBps > MAX_TOTAL_FEE_BPS) {
            revert FeeExceedsMaxCap(newSwapFeeBps, MAX_TOTAL_FEE_BPS);
        }
        if (newProtocolFeeBps > newSwapFeeBps) {
            revert ProtocolFeeExceedsSwapFee(newProtocolFeeBps, newSwapFeeBps);
        }
        swapFeeBps = newSwapFeeBps;
        protocolFeeBps = newProtocolFeeBps;
        emit SwapFeeUpdated(newSwapFeeBps, newProtocolFeeBps);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
