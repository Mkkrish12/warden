import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { Invoice } from "@warden/shared";
import { apPolicyAbi } from "./abi.js";
import { toUsdc6 } from "./money.js";
import { assertMonadReadConfig, assertMonadWriteConfig, type AgentConfig } from "../config.js";

export interface PolicyDecision {
  ok: boolean;
  reason?: string;
}

/** Result of a contract write, once the receipt has confirmed it. */
export interface WriteResult {
  txHash: Hex;
  blockNumber: number;
}

/** Hash a string id the same way the contract and Foundry scripts do. */
export function hashId(id: string): Hex {
  return keccak256(toHex(id));
}

export interface PolicyClient {
  readonly address: Address;
  checkPayable(invoice: Invoice): Promise<PolicyDecision>;
  markPaid(invoice: Invoice): Promise<WriteResult>;
  logBlocked(invoiceId: string, reason: string): Promise<WriteResult>;
  getVendorCap(vendorId: string): Promise<bigint>;
  setVendorCap(vendorId: string, cap: bigint): Promise<WriteResult>;
  isPaid(invoiceId: string): Promise<boolean>;
  explorerTxUrl(txHash: Hex): string;
}

export function createMonadChain(cfg: AgentConfig) {
  return defineChain({
    id: cfg.monad.chainId,
    name: "Monad Testnet",
    nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [cfg.monad.rpcUrl] } },
    blockExplorers: {
      default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" },
    },
    testnet: true,
  });
}

/**
 * Reads and writes the APPolicy contract on Monad.
 *
 * Writes wait for the receipt and reject on a reverted status, so a caller that
 * gets a tx hash back knows the state change actually landed — important because
 * `markPaid` is what prevents double-payment.
 */
export function createPolicyClient(cfg: AgentConfig): PolicyClient {
  assertMonadReadConfig(cfg);

  const chain = createMonadChain(cfg);
  const address = cfg.monad.policyAddress as Address;
  const transport = http(cfg.monad.rpcUrl);
  const publicClient: PublicClient = createPublicClient({ chain, transport });

  let cachedWallet: { wallet: WalletClient; account: ReturnType<typeof privateKeyToAccount> } | null = null;

  function wallet() {
    if (!cachedWallet) {
      assertMonadWriteConfig(cfg);
      const key = cfg.monad.deployerPrivateKey;
      const account = privateKeyToAccount((key.startsWith("0x") ? key : `0x${key}`) as Hex);
      cachedWallet = { wallet: createWalletClient({ account, chain, transport }), account };
    }
    return cachedWallet;
  }

  async function write(
    functionName: "markPaid" | "logBlocked" | "setVendor",
    args: readonly unknown[],
  ): Promise<WriteResult> {
    const { wallet: w, account } = wallet();

    // Simulate first so a policy revert surfaces as a clear error instead of
    // burning gas on a transaction we already know will fail.
    const { request } = await publicClient.simulateContract({
      address,
      abi: apPolicyAbi,
      functionName,
      args: args as never,
      account,
    });

    const txHash = await w.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      throw new Error(`${functionName} transaction reverted (tx ${txHash})`);
    }
    return { txHash, blockNumber: Number(receipt.blockNumber) };
  }

  return {
    address,

    async checkPayable(invoice: Invoice): Promise<PolicyDecision> {
      const [ok, reason] = await publicClient.readContract({
        address,
        abi: apPolicyAbi,
        functionName: "checkPayable",
        args: [hashId(invoice.vendorId), hashId(invoice.invoiceId), toUsdc6(invoice.amount)],
      });
      return ok ? { ok: true } : { ok: false, reason };
    },

    async markPaid(invoice: Invoice): Promise<WriteResult> {
      return write("markPaid", [
        hashId(invoice.invoiceId),
        hashId(invoice.vendorId),
        toUsdc6(invoice.amount),
      ]);
    },

    async logBlocked(invoiceId: string, reason: string): Promise<WriteResult> {
      return write("logBlocked", [hashId(invoiceId), reason]);
    },

    async getVendorCap(vendorId: string): Promise<bigint> {
      return publicClient.readContract({
        address,
        abi: apPolicyAbi,
        functionName: "approvedVendors",
        args: [hashId(vendorId)],
      });
    },

    async setVendorCap(vendorId: string, cap: bigint): Promise<WriteResult> {
      return write("setVendor", [hashId(vendorId), cap]);
    },

    async isPaid(invoiceId: string): Promise<boolean> {
      return publicClient.readContract({
        address,
        abi: apPolicyAbi,
        functionName: "paid",
        args: [hashId(invoiceId)],
      });
    },

    explorerTxUrl(txHash: Hex): string {
      return `https://testnet.monadexplorer.com/tx/${txHash}`;
    },
  };
}
