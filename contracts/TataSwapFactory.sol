// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./TataSwapPool.sol";

/**
 * @title TataSwapFactory
 * @notice Permissionless pair factory deploying deterministic TataSwapPool contracts.
 */
contract TataSwapFactory is Ownable2Step, Pausable {
    address public immutable feeManager;

    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 pairCount);

    error IdenticalAddresses();
    error ZeroAddress();
    error PairExists();

    constructor(address initialOwner, address _feeManager) Ownable(initialOwner) {
        if (_feeManager == address(0)) revert ZeroAddress();
        feeManager = _feeManager;
    }

    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) external whenNotPaused returns (address pair) {
        if (tokenA == tokenB) revert IdenticalAddresses();
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (token0 == address(0)) revert ZeroAddress();
        if (getPair[token0][token1] != address(0)) revert PairExists();

        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        TataSwapPool pool = new TataSwapPool{salt: salt}();
        pool.initialize(token0, token1, feeManager);
        pair = address(pool);

        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
