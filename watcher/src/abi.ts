import { parseAbiItem } from 'viem';

export const TransferEvent = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

export const InvoiceCreatedEvent = parseAbiItem(
  'event InvoiceCreated(bytes32 indexed id, address indexed merchant, address indexed token, uint256 amount, uint64 dueDate)',
);

export const InvoicePaidEvent = parseAbiItem(
  'event InvoicePaid(bytes32 indexed id, address indexed merchant, bytes32 txHash, uint64 paidAt)',
);
