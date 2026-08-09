import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Invoice } from "@warden/shared";

/**
 * Runtime shape of an invoice arriving in the AP inbox. Mirrors the `Invoice`
 * type in @warden/shared — the satisfies check below keeps the two in lockstep.
 */
export const invoiceSchema = z.object({
  invoiceId: z.string().min(1),
  vendorId: z.string().min(1),
  vendorName: z.string().min(1),
  amount: z.number().positive().finite(),
  currency: z.literal("USD"),
  poRef: z.string().min(1).optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string().min(1),
        amount: z.number().finite(),
      }),
    )
    .min(1),
});

// Compile-time guarantee that the schema output matches the shared Invoice type.
type SchemaInvoice = z.infer<typeof invoiceSchema>;
const _typeCheck: SchemaInvoice extends Invoice ? true : never = true;
void _typeCheck;

export interface InvoiceLoadFailure {
  file: string;
  error: string;
}

export interface InboxLoadResult {
  invoices: Invoice[];
  failures: InvoiceLoadFailure[];
}

function formatZodError(err: z.ZodError): string {
  return err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

/**
 * Reads and validates every invoice JSON in `dir`.
 *
 * Invalid files are collected as failures rather than thrown, so one malformed
 * invoice can't take down a whole inbox run — the caller decides what to surface.
 * Results are sorted by filename for deterministic demo ordering.
 */
export async function loadInbox(dir: string): Promise<InboxLoadResult> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch (err) {
    throw new Error(`Could not read invoices directory at ${dir}: ${(err as Error).message}`);
  }

  const files = entries.filter((f) => f.toLowerCase().endsWith(".json")).sort();

  const invoices: Invoice[] = [];
  const failures: InvoiceLoadFailure[] = [];

  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const raw = await fs.readFile(full, "utf8");
      const parsed = invoiceSchema.safeParse(JSON.parse(raw));
      if (parsed.success) {
        invoices.push(parsed.data);
      } else {
        failures.push({ file, error: formatZodError(parsed.error) });
      }
    } catch (err) {
      failures.push({ file, error: (err as Error).message });
    }
  }

  return { invoices, failures };
}
