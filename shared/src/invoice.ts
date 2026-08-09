/** A single line item on a vendor invoice. */
export interface InvoiceLineItem {
  description: string;
  amount: number;
}

/**
 * A vendor invoice ingested by Warden.
 * For the demo these arrive as synthetic JSON in `invoices/`, standing in for a
 * shared ap@company.com mailbox.
 */
export interface Invoice {
  invoiceId: string;
  vendorId: string;
  vendorName: string;
  amount: number;
  currency: "USD";
  poRef?: string;
  lineItems: InvoiceLineItem[];
}
