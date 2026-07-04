// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PicoRouter
 * @notice Atomic 95/5 USDC splitter for Pico micropayments on Base L2.
 *
 * @dev Phase 2 of the x402 migration. With this contract deployed,
 *      x402 payment flows can set `payTo = address(PicoRouter)` and
 *      pass the creator's wallet via the `data` field of the ERC-20
 *      `transferAndCall` payload. The router splits incoming USDC,
 *      forwarding 95% to the creator and keeping 5% (configurable
 *      via tier) for the Pico treasury.
 *
 *      x402 today supports a single payTo address per request, so a
 *      router contract is the cleanest way to keep Pico's fee on
 *      protocol-native flows without re-introducing custody.
 *
 *      DEPLOY TARGETS:
 *        - Base mainnet (chain id 8453)
 *        - Base Sepolia (chain id 84532)
 *
 *      USDC ADDRESSES:
 *        - Base mainnet:  0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 *        - Base Sepolia:  0x036CbD53842c5426634e7929541eC2318f3dCF7e
 *
 *      AUDIT STATUS: Not yet audited. Do not deploy to mainnet
 *      without a third-party audit (CertiK / OpenZeppelin / Trail of Bits).
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract PicoRouter {
    // ─── State ────────────────────────────────────────────────────────
    address public immutable usdc;
    address public treasury;
    address public owner;

    // Fee tiers in basis points (matching src/lib/constants.ts).
    // Sub-$10  → 500 bps (5%)
    // Sub-$50  → 400 bps (4%)
    // Sub-$100 → 380 bps (3.8%)
    // $100+    → 280 bps (2.8%)
    // USDC has 6 decimals so amounts here are in USDC base units.
    uint256 private constant TIER_1_LIMIT  = 10  * 10**6; // $10
    uint256 private constant TIER_2_LIMIT  = 50  * 10**6; // $50
    uint256 private constant TIER_3_LIMIT  = 100 * 10**6; // $100
    uint256 private constant BPS_DENOM     = 10000;

    // ─── Events ───────────────────────────────────────────────────────
    event Split(
        address indexed creator,
        address indexed payer,
        uint256 grossAmount,
        uint256 creatorAmount,
        uint256 feeAmount,
        uint16 feeBps,
        bytes32 indexed linkId
    );

    event TreasuryUpdated(address indexed previous, address indexed next);
    event OwnerUpdated(address indexed previous, address indexed next);

    // ─── Modifiers ────────────────────────────────────────────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "PicoRouter: not owner");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────
    constructor(address _usdc, address _treasury) {
        require(_usdc != address(0), "PicoRouter: zero usdc");
        require(_treasury != address(0), "PicoRouter: zero treasury");
        usdc = _usdc;
        treasury = _treasury;
        owner = msg.sender;
    }

    // ─── Core entry point ─────────────────────────────────────────────
    /**
     * @notice Pull USDC from `msg.sender` and split between creator + treasury.
     * @dev Caller (the x402 payer) must `approve(this, amount)` first. The
     *      facilitator's "exact" scheme does this implicitly via permit-style
     *      EIP-2612 signatures, so end-user payers don't see a separate
     *      approval transaction.
     *
     * @param creator The creator's wallet to receive the net amount.
     * @param amount  Total USDC in base units (6 decimals).
     * @param linkId  Pico link UUID encoded as bytes32 — emitted for indexers
     *                so the dashboard activity feed can correlate this on-chain
     *                event back to the off-chain Pico link.
     */
    function pay(address creator, uint256 amount, bytes32 linkId) external {
        require(creator != address(0), "PicoRouter: zero creator");
        require(amount > 0, "PicoRouter: zero amount");

        uint16 feeBps = _feeBpsForAmount(amount);
        uint256 feeAmount = (amount * feeBps) / BPS_DENOM;
        uint256 creatorAmount = amount - feeAmount;

        IERC20 token = IERC20(usdc);
        require(token.transferFrom(msg.sender, creator, creatorAmount), "PicoRouter: creator xfer failed");
        if (feeAmount > 0) {
            require(token.transferFrom(msg.sender, treasury, feeAmount), "PicoRouter: fee xfer failed");
        }

        emit Split(creator, msg.sender, amount, creatorAmount, feeAmount, feeBps, linkId);
    }

    // ─── Fee computation ──────────────────────────────────────────────
    function _feeBpsForAmount(uint256 amount) private pure returns (uint16) {
        if (amount < TIER_1_LIMIT) return 500;  // 5.0%
        if (amount < TIER_2_LIMIT) return 400;  // 4.0%
        if (amount < TIER_3_LIMIT) return 380;  // 3.8%
        return 280;                              // 2.8%
    }

    // ─── Admin ────────────────────────────────────────────────────────
    function setTreasury(address next) external onlyOwner {
        require(next != address(0), "PicoRouter: zero treasury");
        emit TreasuryUpdated(treasury, next);
        treasury = next;
    }

    function transferOwnership(address next) external onlyOwner {
        require(next != address(0), "PicoRouter: zero owner");
        emit OwnerUpdated(owner, next);
        owner = next;
    }

    // ─── Safety: rescue stuck tokens ──────────────────────────────────
    /**
     * @notice Sweep any tokens that ended up in this contract by mistake.
     *         The router is designed to be balance-zero after every `pay()`
     *         call, so any leftover balance is an anomaly worth claiming.
     */
    function rescue(address token, address to, uint256 amount) external onlyOwner {
        require(IERC20(token).transfer(to, amount), "PicoRouter: rescue failed");
    }
}
