// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {APPolicy} from "../src/APPolicy.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract APPolicyTest is Test {
    APPolicy internal policy;

    address internal owner = address(this);
    address internal stranger = makeAddr("stranger");

    // Demo vendors, hashed the same way the agent hashes them.
    bytes32 internal constant ACME = keccak256("acme-corp");
    bytes32 internal constant GLOBEX = keccak256("globex");
    bytes32 internal constant INITECH = keccak256("initech");
    bytes32 internal constant UNKNOWN = keccak256("not-a-vendor");

    bytes32 internal constant INV_1 = keccak256("INV-2026-001");
    bytes32 internal constant INV_2 = keccak256("INV-2026-002");

    event InvoicePaid(bytes32 indexed invoiceId, bytes32 indexed vendorId, uint256 amount, uint256 timestamp);
    event InvoiceBlocked(bytes32 indexed invoiceId, string reason);
    event VendorSet(bytes32 indexed vendorId, uint256 cap);

    function setUp() public {
        policy = new APPolicy(owner);
        policy.setVendor(ACME, 2000e6);
        policy.setVendor(GLOBEX, 5000e6);
        policy.setVendor(INITECH, 1000e6);
    }

    // -----------------------------------------------------------------------
    // Happy path: approved vendor, under cap
    // -----------------------------------------------------------------------

    function test_CheckPayable_ApprovedUnderCap_Ok() public view {
        (bool ok, string memory reason) = policy.checkPayable(ACME, INV_1, 1240.5e6);
        assertTrue(ok, "approved vendor under cap should be payable");
        assertEq(reason, "");
    }

    function test_CheckPayable_ExactlyAtCap_Ok() public view {
        // Cap is inclusive — only amounts strictly greater than the cap are rejected.
        (bool ok, string memory reason) = policy.checkPayable(ACME, INV_1, 2000e6);
        assertTrue(ok, "amount equal to cap should be payable");
        assertEq(reason, "");
    }

    function test_MarkPaid_RecordsAndEmits() public {
        vm.expectEmit(true, true, true, true);
        emit InvoicePaid(INV_1, ACME, 1240.5e6, block.timestamp);
        policy.markPaid(INV_1, ACME, 1240.5e6);

        assertTrue(policy.paid(INV_1), "invoice should be registered as paid");
    }

    // -----------------------------------------------------------------------
    // Guardrail: over cap
    // -----------------------------------------------------------------------

    function test_CheckPayable_OverCap_Rejected() public view {
        (bool ok, string memory reason) = policy.checkPayable(ACME, INV_2, 48200e6);
        assertFalse(ok, "over-cap invoice must not be payable");
        assertEq(reason, "amount exceeds vendor cap");
    }

    function test_MarkPaid_OverCap_Reverts() public {
        vm.expectRevert(bytes("amount exceeds vendor cap"));
        policy.markPaid(INV_2, ACME, 48200e6);

        assertFalse(policy.paid(INV_2), "over-cap invoice must not be recorded");
    }

    function test_CheckPayable_OneWeiOverCap_Rejected() public view {
        (bool ok, string memory reason) = policy.checkPayable(INITECH, INV_1, 1000e6 + 1);
        assertFalse(ok);
        assertEq(reason, "amount exceeds vendor cap");
    }

    // -----------------------------------------------------------------------
    // Guardrail: unknown / removed vendor
    // -----------------------------------------------------------------------

    function test_CheckPayable_UnknownVendor_Rejected() public view {
        (bool ok, string memory reason) = policy.checkPayable(UNKNOWN, INV_1, 1e6);
        assertFalse(ok, "unknown vendor must not be payable");
        assertEq(reason, "vendor not approved");
    }

    function test_MarkPaid_UnknownVendor_Reverts() public {
        vm.expectRevert(bytes("vendor not approved"));
        policy.markPaid(INV_1, UNKNOWN, 1e6);
    }

    function test_RemovedVendor_BecomesUnapproved() public {
        policy.removeVendor(GLOBEX);

        assertFalse(policy.isApproved(GLOBEX));
        (bool ok, string memory reason) = policy.checkPayable(GLOBEX, INV_1, 10e6);
        assertFalse(ok);
        assertEq(reason, "vendor not approved");
    }

    // -----------------------------------------------------------------------
    // Guardrail: double payment
    // -----------------------------------------------------------------------

    function test_MarkPaid_Twice_Reverts() public {
        policy.markPaid(INV_1, ACME, 500e6);
        assertTrue(policy.paid(INV_1));

        vm.expectRevert(bytes("invoice already paid"));
        policy.markPaid(INV_1, ACME, 500e6);
    }

    function test_CheckPayable_AfterPaid_Rejected() public {
        policy.markPaid(INV_1, ACME, 500e6);

        (bool ok, string memory reason) = policy.checkPayable(ACME, INV_1, 500e6);
        assertFalse(ok, "already-paid invoice must not be payable again");
        assertEq(reason, "invoice already paid");
    }

    /// @dev Regression: "already paid" must win over every other rejection reason.
    ///      If a cap violation masked it, a human approving the reported reason
    ///      ("amount exceeds vendor cap") would mint a card for a settled invoice.
    function test_CheckPayable_AlreadyPaid_TakesPrecedenceOverCap() public {
        policy.markPaid(INV_1, ACME, 500e6);
        policy.setVendor(ACME, 100e6); // now the paid invoice is also over cap

        (bool ok, string memory reason) = policy.checkPayable(ACME, INV_1, 500e6);
        assertFalse(ok);
        assertEq(reason, "invoice already paid", "already-paid must mask cap violations");
    }

    /// @dev Same precedence rule when the vendor has been de-approved entirely.
    function test_CheckPayable_AlreadyPaid_TakesPrecedenceOverUnapprovedVendor() public {
        policy.markPaid(INV_1, ACME, 500e6);
        policy.removeVendor(ACME);

        (bool ok, string memory reason) = policy.checkPayable(ACME, INV_1, 500e6);
        assertFalse(ok);
        assertEq(reason, "invoice already paid");
    }

    function test_MarkPaid_Twice_DifferentVendor_StillReverts() public {
        policy.markPaid(INV_1, ACME, 500e6);

        // Same invoice id re-submitted under another approved vendor.
        vm.expectRevert(bytes("invoice already paid"));
        policy.markPaid(INV_1, GLOBEX, 500e6);
    }

    // -----------------------------------------------------------------------
    // Vendor management
    // -----------------------------------------------------------------------

    function test_SetVendor_EmitsAndUpdatesCap() public {
        vm.expectEmit(true, true, true, true);
        emit VendorSet(ACME, 3000e6);
        policy.setVendor(ACME, 3000e6);

        assertEq(policy.approvedVendors(ACME), 3000e6);
    }

    function test_SetVendor_ZeroCap_Reverts() public {
        vm.expectRevert(bytes("cap must be > 0; use removeVendor"));
        policy.setVendor(ACME, 0);
    }

    function test_SeededCapsMatchDemoValues() public view {
        assertEq(policy.approvedVendors(ACME), 2000e6);
        assertEq(policy.approvedVendors(GLOBEX), 5000e6);
        assertEq(policy.approvedVendors(INITECH), 1000e6);
    }

    // -----------------------------------------------------------------------
    // Audit trail
    // -----------------------------------------------------------------------

    function test_LogBlocked_EmitsWithoutChangingState() public {
        vm.expectEmit(true, true, true, true);
        emit InvoiceBlocked(INV_2, "amount exceeds vendor cap");
        policy.logBlocked(INV_2, "amount exceeds vendor cap");

        // Blocking is an audit log only — the invoice stays payable after review.
        assertFalse(policy.paid(INV_2));
        (bool ok,) = policy.checkPayable(ACME, INV_2, 100e6);
        assertTrue(ok, "logging a block must not poison the invoice");
    }

    // -----------------------------------------------------------------------
    // Access control
    // -----------------------------------------------------------------------

    function test_OnlyOwner_SetVendor() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        policy.setVendor(ACME, 1e6);
    }

    function test_OnlyOwner_MarkPaid() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        policy.markPaid(INV_1, ACME, 1e6);
    }

    function test_OnlyOwner_RemoveVendor() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        policy.removeVendor(ACME);
    }

    function test_OnlyOwner_LogBlocked() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        policy.logBlocked(INV_1, "nope");
    }

    // -----------------------------------------------------------------------
    // Fuzz
    // -----------------------------------------------------------------------

    function testFuzz_CheckPayable_RespectsCap(uint256 amount) public view {
        amount = bound(amount, 1, type(uint128).max);
        (bool ok, string memory reason) = policy.checkPayable(ACME, INV_1, amount);

        if (amount <= 2000e6) {
            assertTrue(ok);
            assertEq(reason, "");
        } else {
            assertFalse(ok);
            assertEq(reason, "amount exceeds vendor cap");
        }
    }
}
