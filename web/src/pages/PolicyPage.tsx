import { Badge, Card, MonoPill, PageTitle, Table } from "../components/ui";
import { explorerAddressUrl, usd } from "../lib/format";

/**
 * The seeded policy, mirroring contracts/script/Deploy.s.sol. The contract is the
 * source of truth; this is the human-readable view of what was seeded.
 */
const VENDORS = [
  { name: "Acme Corp", id: "acme-corp", cap: 2000 },
  { name: "Globex Industries", id: "globex", cap: 5000 },
  { name: "Initech", id: "initech", cap: 1000 },
];

export function PolicyPage({ policyAddress }: { policyAddress?: string }) {
  return (
    <>
      <PageTitle title="Vendor Policy" subtitle="Enforced on-chain via Monad" />

      <Card padding={false}>
        <Table
          head={
            <>
              <th className="px-5 py-2.5 font-medium">Vendor Name</th>
              <th className="px-4 py-2.5 font-medium">Vendor ID</th>
              <th className="px-4 py-2.5 text-right font-medium">Spend Cap</th>
              <th className="px-5 py-2.5 font-medium">Status</th>
            </>
          }
        >
          {VENDORS.map((v) => (
            <tr key={v.id} className="border-b border-border last:border-b-0 hover:bg-hover">
              <td className="px-5 py-3 text-[13px] font-medium text-text">{v.name}</td>
              <td className="px-4 py-3 font-mono text-[13px] text-text-sub">{v.id}</td>
              <td className="tnum px-4 py-3 text-right text-[13px] font-semibold text-text">
                {usd(v.cap)}
              </td>
              <td className="px-5 py-3">
                <Badge tone="success">Active</Badge>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="mt-4 flex items-center gap-2">
        <span className="text-xs text-text-sub">Policy contract</span>
        {policyAddress ? (
          <MonoPill href={explorerAddressUrl(policyAddress)}>{policyAddress}</MonoPill>
        ) : (
          <MonoPill>not deployed</MonoPill>
        )}
      </div>

      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-text-tertiary">
        Caps are per invoice. An invoice above a vendor's cap, or from a vendor not on this list,
        is escalated to a human — no card is issued.
      </p>
    </>
  );
}
