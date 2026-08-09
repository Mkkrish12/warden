import { ExternalLink } from "lucide-react";
import { Badge, Card, PageTitle } from "../components/ui";
import { explorerAddressUrl } from "../lib/format";
import type { AgentMeta } from "../lib/useAgentStream";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-3.5 last:border-b-0">
      <span className="text-[13px] text-text-sub">{label}</span>
      <span className="text-right text-[13px] text-text">{children}</span>
    </div>
  );
}

export function SettingsPage({ meta }: { meta: AgentMeta }) {
  const rainConnected = meta.cardIssuer === "rain";
  const onMonadTestnet = meta.chainId === 10143;

  return (
    <>
      <PageTitle title="Settings" subtitle="Connection status for the live infrastructure" />

      <Card padding={false}>
        <Row label="Monad Contract Address">
          {meta.policyAddress ? (
            <a
              href={explorerAddressUrl(meta.policyAddress)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-xs text-brand hover:underline"
            >
              {meta.policyAddress}
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : (
            <span className="text-text-tertiary">Not deployed</span>
          )}
        </Row>

        <Row label="Chain">
          {meta.chainId === undefined ? (
            <span className="text-text-tertiary">Unknown</span>
          ) : onMonadTestnet ? (
            <Badge tone="success">Monad Testnet · 10143</Badge>
          ) : (
            <Badge tone="warning">Chain {meta.chainId} · not Monad</Badge>
          )}
        </Row>

        <Row label="Rain API Status">
          {rainConnected ? (
            <Badge tone="success">Connected</Badge>
          ) : (
            <Badge tone="critical">Not Connected</Badge>
          )}
        </Row>

        <Row label="Card Issuer">
          <span className="font-mono text-xs">{meta.cardIssuer ?? "—"}</span>
        </Row>

        <Row label="On Policy Failure">
          <span className="capitalize">{meta.blockedMode ?? "—"}</span>
        </Row>

        <Row label="Slack Channel">
          <span className="text-text-tertiary">Configured in agent environment</span>
        </Row>
      </Card>

      {!rainConnected && (
        <p className="mt-4 max-w-2xl text-xs leading-relaxed text-text-tertiary">
          Cards are currently issued by the stub provider, not Rain. Scope constraints are
          enforced in the card scope, but no live Rain card exists.
        </p>
      )}
    </>
  );
}
