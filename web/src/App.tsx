import { useState } from "react";
import { Sidebar, type PageId } from "./components/Sidebar";
import { useAgentStream } from "./lib/useAgentStream";
import { DashboardPage } from "./pages/DashboardPage";
import { InvoicesPage } from "./pages/InvoicesPage";
import { InvoiceDetail } from "./pages/InvoiceDetail";
import { TransactionsPage } from "./pages/TransactionsPage";
import { PolicyPage } from "./pages/PolicyPage";
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  const { events, invoices, connection, meta, approve, reject, busy } = useAgentStream();
  const [page, setPage] = useState<PageId>("dashboard");
  const [openInvoiceId, setOpenInvoiceId] = useState<string>();

  const openInvoice = invoices.find((i) => i.invoiceId === openInvoiceId);
  const pendingCount = invoices.filter((i) => i.status === "awaiting_approval").length;

  const showInvoice = (invoiceId: string) => {
    setPage("invoices");
    setOpenInvoiceId(invoiceId);
  };

  return (
    <div className="flex h-full bg-page">
      <Sidebar
        active={page}
        onNavigate={setPage}
        connection={connection}
        pendingCount={pendingCount}
      />

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1200px] px-6 py-6">
          {page === "dashboard" && (
            <DashboardPage invoices={invoices} events={events} onOpenInvoice={showInvoice} />
          )}
          {page === "invoices" && (
            <InvoicesPage invoices={invoices} onOpenInvoice={setOpenInvoiceId} />
          )}
          {page === "transactions" && <TransactionsPage events={events} invoices={invoices} />}
          {page === "policy" && <PolicyPage policyAddress={meta.policyAddress} />}
          {page === "settings" && <SettingsPage meta={meta} />}
        </div>
      </main>

      {openInvoice && (
        <InvoiceDetail
          invoice={openInvoice}
          busy={busy.has(openInvoice.invoiceId)}
          onClose={() => setOpenInvoiceId(undefined)}
          onApprove={approve}
          onReject={reject}
        />
      )}
    </div>
  );
}
