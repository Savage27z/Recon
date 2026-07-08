// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {InvoiceRegistry} from "../src/InvoiceRegistry.sol";

contract InvoiceRegistryTest is Test {
    InvoiceRegistry registry;

    address merchant = makeAddr("merchant");
    address otherMerchant = makeAddr("otherMerchant");
    address token = makeAddr("token");

    bytes32 constant ID = keccak256("invoice-1");
    uint256 constant AMOUNT = 100e6;
    uint64 constant DUE = 1_800_000_000;

    event InvoiceCreated(
        bytes32 indexed id,
        address indexed merchant,
        address indexed token,
        uint256 amount,
        uint64 dueDate
    );

    event InvoicePaid(
        bytes32 indexed id,
        address indexed merchant,
        bytes32 txHash,
        uint64 paidAt
    );

    function setUp() public {
        registry = new InvoiceRegistry();
    }

    function _create() internal {
        vm.prank(merchant);
        registry.createInvoice(ID, AMOUNT, token, DUE);
    }

    function test_createInvoice_stores_and_emits() public {
        vm.expectEmit(true, true, true, true, address(registry));
        emit InvoiceCreated(ID, merchant, token, AMOUNT, DUE);

        vm.prank(merchant);
        registry.createInvoice(ID, AMOUNT, token, DUE);

        InvoiceRegistry.Invoice memory inv = registry.getInvoice(ID);
        assertEq(inv.merchant, merchant);
        assertEq(inv.token, token);
        assertEq(inv.amount, AMOUNT);
        assertEq(inv.dueDate, DUE);
        assertEq(inv.createdAt, block.timestamp);
        assertEq(inv.paidAt, 0);
        assertEq(uint8(inv.status), uint8(InvoiceRegistry.Status.Open));
        assertEq(inv.txHash, bytes32(0));
    }

    function test_createInvoice_revert_duplicateId() public {
        _create();
        vm.prank(merchant);
        vm.expectRevert(abi.encodeWithSelector(InvoiceRegistry.InvoiceExists.selector, ID));
        registry.createInvoice(ID, AMOUNT, token, DUE);
    }

    function test_createInvoice_revert_zeroAmount() public {
        vm.prank(merchant);
        vm.expectRevert(InvoiceRegistry.ZeroAmount.selector);
        registry.createInvoice(ID, 0, token, DUE);
    }

    function test_createInvoice_revert_zeroToken() public {
        vm.prank(merchant);
        vm.expectRevert(InvoiceRegistry.ZeroToken.selector);
        registry.createInvoice(ID, AMOUNT, address(0), DUE);
    }

    function test_createInvoice_revert_zeroId() public {
        vm.prank(merchant);
        vm.expectRevert(InvoiceRegistry.ZeroId.selector);
        registry.createInvoice(bytes32(0), AMOUNT, token, DUE);
    }

    function test_markPaid_updates_and_emits() public {
        _create();

        bytes32 txHash = keccak256("tx");
        uint64 paidAt = uint64(block.timestamp + 60);
        vm.warp(paidAt);

        vm.expectEmit(true, true, false, true, address(registry));
        emit InvoicePaid(ID, merchant, txHash, paidAt);

        vm.prank(merchant);
        registry.markPaid(ID, txHash);

        InvoiceRegistry.Invoice memory inv = registry.getInvoice(ID);
        assertEq(uint8(inv.status), uint8(InvoiceRegistry.Status.Paid));
        assertEq(inv.txHash, txHash);
        assertEq(inv.paidAt, paidAt);
    }

    function test_markPaid_revert_unknownId() public {
        vm.prank(merchant);
        vm.expectRevert(abi.encodeWithSelector(InvoiceRegistry.InvoiceUnknown.selector, ID));
        registry.markPaid(ID, keccak256("tx"));
    }

    function test_markPaid_revert_notMerchant() public {
        _create();
        vm.prank(otherMerchant);
        vm.expectRevert(
            abi.encodeWithSelector(InvoiceRegistry.NotMerchant.selector, ID, otherMerchant)
        );
        registry.markPaid(ID, keccak256("tx"));
    }

    function test_markPaid_revert_alreadyPaid() public {
        _create();
        vm.prank(merchant);
        registry.markPaid(ID, keccak256("tx"));

        vm.prank(merchant);
        vm.expectRevert(abi.encodeWithSelector(InvoiceRegistry.InvoiceAlreadyPaid.selector, ID));
        registry.markPaid(ID, keccak256("tx-2"));
    }

    function test_statusOf_defaultsToNone() public view {
        assertEq(uint8(registry.statusOf(keccak256("nope"))), uint8(InvoiceRegistry.Status.None));
    }

    function testFuzz_createInvoice_isolation(bytes32 idA, bytes32 idB, uint256 amtA, uint256 amtB)
        public
    {
        vm.assume(idA != bytes32(0) && idB != bytes32(0) && idA != idB);
        vm.assume(amtA > 0 && amtB > 0);

        vm.prank(merchant);
        registry.createInvoice(idA, amtA, token, DUE);
        vm.prank(otherMerchant);
        registry.createInvoice(idB, amtB, token, DUE);

        assertEq(registry.getInvoice(idA).merchant, merchant);
        assertEq(registry.getInvoice(idB).merchant, otherMerchant);
        assertEq(registry.getInvoice(idA).amount, amtA);
        assertEq(registry.getInvoice(idB).amount, amtB);
    }
}
