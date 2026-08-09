/**
 * Minimal ABI for APPolicy (contracts/src/APPolicy.sol) — only the members the
 * agent actually uses. Kept hand-written so the agent doesn't depend on Foundry
 * build output being present.
 */
export const apPolicyAbi = [
  {
    type: "function",
    name: "checkPayable",
    stateMutability: "view",
    inputs: [
      { name: "vendorId", type: "bytes32" },
      { name: "invoiceId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [
      { name: "ok", type: "bool" },
      { name: "reason", type: "string" },
    ],
  },
  {
    type: "function",
    name: "markPaid",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "vendorId", type: "bytes32" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "logBlocked",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setVendor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vendorId", type: "bytes32" },
      { name: "cap", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "approvedVendors",
    stateMutability: "view",
    inputs: [{ name: "vendorId", type: "bytes32" }],
    outputs: [{ name: "cap", type: "uint256" }],
  },
  {
    type: "function",
    name: "paid",
    stateMutability: "view",
    inputs: [{ name: "invoiceId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event",
    name: "InvoicePaid",
    inputs: [
      { name: "invoiceId", type: "bytes32", indexed: true },
      { name: "vendorId", type: "bytes32", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "InvoiceBlocked",
    inputs: [
      { name: "invoiceId", type: "bytes32", indexed: true },
      { name: "reason", type: "string", indexed: false },
    ],
  },
  {
    type: "event",
    name: "VendorSet",
    inputs: [
      { name: "vendorId", type: "bytes32", indexed: true },
      { name: "cap", type: "uint256", indexed: false },
    ],
  },
] as const;
