// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title APPolicy — on-chain accounts-payable policy and payment registry
/// @notice Holds the company's AP policy (approved vendors + per-vendor spend caps)
///         and the registry of paid invoices. The Warden agent reads this contract
///         before minting a Rain scoped card, and writes to it after settlement so
///         an invoice can never be paid twice.
/// @dev Amounts are denominated in USDC with 6 decimals (e.g. 2000e6 == $2,000.00).
contract APPolicy is Ownable {
    // -----------------------------------------------------------------------
    // Storage
    // -----------------------------------------------------------------------

    /// @notice Per-vendor spend cap, keyed by keccak256(vendor string id).
    /// @dev A cap of 0 means the vendor is NOT approved. There is therefore no
    ///      such thing as an approved vendor with a zero cap.
    mapping(bytes32 vendorId => uint256 cap) public approvedVendors;

    /// @notice Invoices that have already been settled, keyed by keccak256(invoice id).
    mapping(bytes32 invoiceId => bool paid) public paid;

    // -----------------------------------------------------------------------
    // Events
    // -----------------------------------------------------------------------

    event InvoicePaid(bytes32 indexed invoiceId, bytes32 indexed vendorId, uint256 amount, uint256 timestamp);
    event InvoiceBlocked(bytes32 indexed invoiceId, string reason);
    event VendorSet(bytes32 indexed vendorId, uint256 cap);

    // -----------------------------------------------------------------------
    // Rejection reasons — kept as constants so off-chain code and tests can
    // match on the exact strings surfaced by checkPayable / markPaid.
    // -----------------------------------------------------------------------

    string internal constant REASON_NOT_APPROVED = "vendor not approved";
    string internal constant REASON_OVER_CAP = "amount exceeds vendor cap";
    string internal constant REASON_ALREADY_PAID = "invoice already paid";

    constructor(address initialOwner) Ownable(initialOwner) {}

    // -----------------------------------------------------------------------
    // Admin — policy management
    // -----------------------------------------------------------------------

    /// @notice Add or update an approved vendor and its spend cap.
    /// @param vendorId keccak256 hash of the vendor's string id (e.g. "acme-corp").
    /// @param cap Maximum payable amount per invoice, in USDC 6-decimals. Must be > 0.
    function setVendor(bytes32 vendorId, uint256 cap) external onlyOwner {
        require(cap > 0, "cap must be > 0; use removeVendor");
        approvedVendors[vendorId] = cap;
        emit VendorSet(vendorId, cap);
    }

    /// @notice Revoke a vendor's approval by zeroing its cap.
    function removeVendor(bytes32 vendorId) external onlyOwner {
        approvedVendors[vendorId] = 0;
        emit VendorSet(vendorId, 0);
    }

    // -----------------------------------------------------------------------
    // Policy evaluation
    // -----------------------------------------------------------------------

    /// @notice Evaluate whether an invoice may be paid under current policy.
    /// @dev Pure read — the agent calls this BEFORE minting any Rain card.
    ///      Returns a reason string rather than reverting so the agent can put the
    ///      rejection cause straight into a Slack escalation.
    /// @return ok True when the vendor is approved, the amount is within cap, and
    ///         the invoice has not already been paid.
    /// @return reason Empty when ok; otherwise a human-readable rejection cause.
    function checkPayable(bytes32 vendorId, bytes32 invoiceId, uint256 amount)
        external
        view
        returns (bool ok, string memory reason)
    {
        return _checkPayable(vendorId, invoiceId, amount);
    }

    function _checkPayable(bytes32 vendorId, bytes32 invoiceId, uint256 amount)
        internal
        view
        returns (bool ok, string memory reason)
    {
        // Already-paid is checked FIRST and deliberately so. It is the only
        // terminal condition — a human may reasonably approve an exception to a
        // cap or an unapproved vendor, but never a second payment. Checking it
        // last would let a cap violation mask it, and an approver acting on
        // "amount exceeds vendor cap" would mint a card for an invoice that was
        // already settled.
        if (paid[invoiceId]) return (false, REASON_ALREADY_PAID);

        uint256 cap = approvedVendors[vendorId];
        if (cap == 0) return (false, REASON_NOT_APPROVED);
        if (amount > cap) return (false, REASON_OVER_CAP);
        return (true, "");
    }

    // -----------------------------------------------------------------------
    // Settlement registry
    // -----------------------------------------------------------------------

    /// @notice Record an invoice as paid. Re-runs every policy check so the registry
    ///         can never disagree with the policy, even if state changed between the
    ///         agent's checkPayable call and settlement.
    /// @dev Reverts on any policy violation — including a second call for the same
    ///      invoice, which is what makes double-payment impossible.
    function markPaid(bytes32 invoiceId, bytes32 vendorId, uint256 amount) external onlyOwner {
        (bool ok, string memory reason) = _checkPayable(vendorId, invoiceId, amount);
        require(ok, reason);

        paid[invoiceId] = true;
        emit InvoicePaid(invoiceId, vendorId, amount, block.timestamp);
    }

    /// @notice Record a rejected invoice on-chain for the audit trail.
    /// @dev Deliberately does not touch policy state — this is an append-only log of
    ///      decisions the agent made, so blocked invoices remain payable after review.
    function logBlocked(bytes32 invoiceId, string calldata reason) external onlyOwner {
        emit InvoiceBlocked(invoiceId, reason);
    }

    // -----------------------------------------------------------------------
    // Convenience views
    // -----------------------------------------------------------------------

    /// @notice True when the vendor is approved (non-zero cap).
    function isApproved(bytes32 vendorId) external view returns (bool) {
        return approvedVendors[vendorId] > 0;
    }
}
