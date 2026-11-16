// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./TataSwapFactory.sol";

/**
 * @title TataSwapListingFee
 * @notice Permissionless token listing registry with atomic on-chain listing fee collection.
 * @dev Collects configured fee (default 5 USDT) directly from the listing wallet to the DEX owner's
 *      feeReceiverWallet (default 0xD9e5c5d0522B1eeE8Ff9bC006F64d53d2C411CA4). No fees are stored
 *      in the contract or any centralized database; if registration or pair creation fails, the entire
 *      transaction reverts atomically so the user never loses the listing fee.
 */
contract TataSwapListingFee is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct ListedToken {
        address tokenAddress;
        address lister;
        string name;
        string symbol;
        uint8 decimals;
        address pairToken;
        address pairAddress;
        uint256 feePaid;
        address paymentToken;
        uint256 listedAt;
        bool exists;
    }

    address public feeReceiverWallet;
    address public paymentToken;
    uint256 public listingFee;
    TataSwapFactory public factory;

    mapping(address => ListedToken) public listings;
    address[] public allListedTokens;

    event ListingFeeCollected(
        address indexed lister,
        address indexed tokenAddress,
        address indexed paymentToken,
        uint256 feeAmount,
        address feeReceiverWallet,
        uint256 timestamp
    );

    event TokenListed(
        address indexed tokenAddress,
        address indexed lister,
        string name,
        string symbol,
        uint8 decimals,
        address pairAddress,
        uint256 timestamp
    );

    event ListingFeeUpdated(uint256 previousFee, uint256 newFee);
    event PaymentTokenUpdated(address indexed previousToken, address indexed newToken);
    event FeeReceiverUpdated(address indexed previousReceiver, address indexed newReceiver);
    event FactoryUpdated(address indexed previousFactory, address indexed newFactory);

    error ZeroAddress();
    error NotAContract(address target);
    error InvalidERC20Token(address target);
    error TokenAlreadyListed(address token);
    error InsufficientPaymentBalance(uint256 balance, uint256 required);
    error InsufficientPaymentAllowance(uint256 allowance, uint256 required);

    constructor(
        address initialOwner,
        address initialFeeReceiver,
        address initialPaymentToken,
        uint256 initialListingFee,
        address initialFactory
    ) Ownable(initialOwner) {
        if (
            initialFeeReceiver == address(0) ||
            initialPaymentToken == address(0) ||
            initialFactory == address(0)
        ) {
            revert ZeroAddress();
        }
        feeReceiverWallet = initialFeeReceiver;
        paymentToken = initialPaymentToken;
        listingFee = initialListingFee;
        factory = TataSwapFactory(initialFactory);

        emit FeeReceiverUpdated(address(0), initialFeeReceiver);
        emit PaymentTokenUpdated(address(0), initialPaymentToken);
        emit ListingFeeUpdated(0, initialListingFee);
        emit FactoryUpdated(address(0), initialFactory);
    }

    function totalListedTokens() external view returns (uint256) {
        return allListedTokens.length;
    }

    /**
     * @notice Permissionlessly list an ERC-20 / BEP-20 compatible token and optionally register a trading pair.
     * @param tokenAddress The deployed ERC-20/BEP-20 token contract address to list.
     * @param pairWithToken Optional quote token (e.g. WBNB or USDT) to create/register a pool. Pass address(0) to skip.
     */
    function listToken(address tokenAddress, address pairWithToken)
        external
        nonReentrant
        whenNotPaused
        returns (address pairAddress)
    {
        if (tokenAddress == address(0)) revert ZeroAddress();
        if (tokenAddress.code.length == 0) revert NotAContract(tokenAddress);
        if (listings[tokenAddress].exists) revert TokenAlreadyListed(tokenAddress);

        // Verify ERC-20 / BEP-20 metadata interface on-chain
        string memory tokenName;
        string memory tokenSymbol;
        uint8 tokenDecimals;

        try IERC20Metadata(tokenAddress).name() returns (string memory _name) {
            tokenName = _name;
        } catch {
            revert InvalidERC20Token(tokenAddress);
        }

        try IERC20Metadata(tokenAddress).symbol() returns (string memory _symbol) {
            tokenSymbol = _symbol;
        } catch {
            revert InvalidERC20Token(tokenAddress);
        }

        try IERC20Metadata(tokenAddress).decimals() returns (uint8 _decimals) {
            tokenDecimals = _decimals;
        } catch {
            revert InvalidERC20Token(tokenAddress);
        }

        // Verify totalSupply call succeeds to confirm standard token behavior
        try IERC20(tokenAddress).totalSupply() returns (uint256) {} catch {
            revert InvalidERC20Token(tokenAddress);
        }

        // Register or create trading pair if requested (reverts atomically on failure before or alongside fee transfer)
        if (pairWithToken != address(0)) {
            if (pairWithToken.code.length == 0) revert NotAContract(pairWithToken);
            pairAddress = factory.getPair(tokenAddress, pairWithToken);
            if (pairAddress == address(0)) {
                pairAddress = factory.createPair(tokenAddress, pairWithToken);
            }
        }

        // Collect listing fee directly to feeReceiverWallet (no central custody)
        uint256 feeToPay = listingFee;
        address payToken = paymentToken;
        address receiver = feeReceiverWallet;

        if (feeToPay > 0) {
            uint256 userBalance = IERC20(payToken).balanceOf(msg.sender);
            if (userBalance < feeToPay) {
                revert InsufficientPaymentBalance(userBalance, feeToPay);
            }
            uint256 userAllowance = IERC20(payToken).allowance(msg.sender, address(this));
            if (userAllowance < feeToPay) {
                revert InsufficientPaymentAllowance(userAllowance, feeToPay);
            }

            uint256 receiverBefore = IERC20(payToken).balanceOf(receiver);
            IERC20(payToken).safeTransferFrom(msg.sender, receiver, feeToPay);
            uint256 receiverAfter = IERC20(payToken).balanceOf(receiver);
            require(receiverAfter >= receiverBefore + feeToPay, "FEE_DELIVERY_VERIFICATION_FAILED");

            emit ListingFeeCollected(
                msg.sender,
                tokenAddress,
                payToken,
                feeToPay,
                receiver,
                block.timestamp
            );
        }

        listings[tokenAddress] = ListedToken({
            tokenAddress: tokenAddress,
            lister: msg.sender,
            name: tokenName,
            symbol: tokenSymbol,
            decimals: tokenDecimals,
            pairToken: pairWithToken,
            pairAddress: pairAddress,
            feePaid: feeToPay,
            paymentToken: payToken,
            listedAt: block.timestamp,
            exists: true
        });
        allListedTokens.push(tokenAddress);

        emit TokenListed(
            tokenAddress,
            msg.sender,
            tokenName,
            tokenSymbol,
            tokenDecimals,
            pairAddress,
            block.timestamp
        );
    }

    function setListingFee(uint256 newFee) external onlyOwner {
        uint256 old = listingFee;
        listingFee = newFee;
        emit ListingFeeUpdated(old, newFee);
    }

    function setPaymentToken(address newPaymentToken) external onlyOwner {
        if (newPaymentToken == address(0)) revert ZeroAddress();
        if (newPaymentToken.code.length == 0) revert NotAContract(newPaymentToken);
        address old = paymentToken;
        paymentToken = newPaymentToken;
        emit PaymentTokenUpdated(old, newPaymentToken);
    }

    function setFeeReceiverWallet(address newFeeReceiver) external onlyOwner {
        if (newFeeReceiver == address(0)) revert ZeroAddress();
        address old = feeReceiverWallet;
        feeReceiverWallet = newFeeReceiver;
        emit FeeReceiverUpdated(old, newFeeReceiver);
    }

    function setFactory(address newFactory) external onlyOwner {
        if (newFactory == address(0)) revert ZeroAddress();
        address old = address(factory);
        factory = TataSwapFactory(newFactory);
        emit FactoryUpdated(old, newFactory);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
