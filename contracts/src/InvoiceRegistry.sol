// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title InvoiceRegistry
/// @notice On-chain reference table for off-chain-issued stablecoin invoices.
///         The Recon watcher observes ERC20 Transfer events, matches them
///         to open invoices, and calls markPaid(id, txHash) to close them.
contract InvoiceRegistry {
    enum Status {
        None,
        Open,
        Paid
    }

    struct Invoice {
        address merchant;
        address token;
        uint256 amount;
        uint64 dueDate;
        uint64 createdAt;
        uint64 paidAt;
        Status status;
        bytes32 txHash;
    }

    mapping(bytes32 id => Invoice) private _invoices;

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

    error InvoiceExists(bytes32 id);
    error InvoiceUnknown(bytes32 id);
    error InvoiceAlreadyPaid(bytes32 id);
    error NotMerchant(bytes32 id, address caller);
    error ZeroAmount();
    error ZeroToken();
    error ZeroId();

    function createInvoice(
        bytes32 id,
        uint256 amount,
        address token,
        uint64 dueDate
    ) external {
        if (id == bytes32(0)) revert ZeroId();
        if (amount == 0) revert ZeroAmount();
        if (token == address(0)) revert ZeroToken();
        if (_invoices[id].status != Status.None) revert InvoiceExists(id);

        _invoices[id] = Invoice({
            merchant: msg.sender,
            token: token,
            amount: amount,
            dueDate: dueDate,
            createdAt: uint64(block.timestamp),
            paidAt: 0,
            status: Status.Open,
            txHash: bytes32(0)
        });

        emit InvoiceCreated(id, msg.sender, token, amount, dueDate);
    }

    function markPaid(bytes32 id, bytes32 txHash) external {
        Invoice storage inv = _invoices[id];
        Status s = inv.status;
        if (s == Status.None) revert InvoiceUnknown(id);
        if (s == Status.Paid) revert InvoiceAlreadyPaid(id);
        if (inv.merchant != msg.sender) revert NotMerchant(id, msg.sender);

        inv.status = Status.Paid;
        inv.txHash = txHash;
        inv.paidAt = uint64(block.timestamp);

        emit InvoicePaid(id, inv.merchant, txHash, uint64(block.timestamp));
    }

    function getInvoice(bytes32 id) external view returns (Invoice memory) {
        return _invoices[id];
    }

    function statusOf(bytes32 id) external view returns (Status) {
        return _invoices[id].status;
    }
}
