import type { BlockHeights, StatusSummary } from "@/lib/api";
import {
  computeDelta,
  formatDelta,
  formatHeight,
  formatMilliseconds,
  formatSeconds,
  getDeltaTone,
} from "@/lib/metrics";
import { Sparkline } from "@/components/Sparkline";

export type CardKind = "bp" | "rpc";

export type CardData = {
  id: string;
  kind: CardKind;
  title: string;
  height: number | null;
  heights?: BlockHeights | null;
  status?: StatusSummary | null;
  leader?: string | null;
  lastAppliedAgeSec?: number | null;
  avgProductionDelayMs?: number | null;
  avgVerificationDelayMs?: number | null;
  avgTransactions?: number | null;
  sparkline?: number[] | null;
  role?: string | null;
  error?: string | null;
};

const toneStyles: Record<ReturnType<typeof getDeltaTone>, string> = {
  neutral: "text-foreground",
  warning: "text-yellow-600 dark:text-yellow-400",
  danger: "text-red-600 dark:text-red-400",
};

function truncateMiddle(value: string, head = 8, tail = 8): string {
  if (value.length <= head + tail + 1) {
    return value;
  }
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function StatusCard({ card, maxHeight }: { card: CardData; maxHeight: number | null }) {
  const delta = computeDelta(card.height, maxHeight);
  const tone = getDeltaTone(delta);
  const leaderLabel = card.leader ? truncateMiddle(card.leader) : "—";

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            {card.kind === "bp" ? "Block Producer" : "RPC"}
          </div>
          <div className="mt-1 text-lg font-semibold text-foreground">{card.title}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {card.kind}
          </span>
          {card.kind === "bp" ? (
            <span className="rounded-full border border-border bg-card px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {(card.role ?? "Watcher").toUpperCase()}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Height
          </div>
          <div className={`text-3xl font-semibold ${toneStyles[tone]}`}>
            {formatHeight(card.height)}
          </div>
          <div className={`text-sm font-medium ${toneStyles[tone]}`}>
            {formatDelta(delta)}
          </div>
        </div>
        {card.sparkline && card.sparkline.length > 1 ? (
          <Sparkline
            series={card.sparkline}
            className="h-10 w-28 text-muted-foreground/80"
          />
        ) : null}
      </div>

      {card.error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {card.error}
        </div>
      ) : null}

      {card.kind === "bp" && card.heights ? (
        <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground sm:grid-cols-3">
          <div className="flex flex-col gap-1 leading-tight">
            <div className="uppercase tracking-wide">Ap</div>
            <div className="font-mono text-foreground/80">
              {formatHeight(card.heights.applied)}
            </div>
          </div>
          <div className="flex flex-col gap-1 leading-tight">
            <div className="uppercase tracking-wide">Com</div>
            <div className="font-mono text-foreground/80">
              {formatHeight(card.heights.committed)}
            </div>
          </div>
          <div className="flex flex-col gap-1 leading-tight">
            <div className="uppercase tracking-wide">Pro</div>
            <div className="font-mono text-foreground/80">
              {formatHeight(card.heights.proven)}
            </div>
          </div>
          <div className="flex flex-col gap-1 leading-tight">
            <div className="uppercase tracking-wide">App</div>
            <div className="font-mono text-foreground/80">
              {formatHeight(card.heights.appended)}
            </div>
          </div>
          <div className="flex flex-col gap-1 leading-tight">
            <div className="uppercase tracking-wide">Know</div>
            <div className="font-mono text-foreground/80">
              {formatHeight(card.heights.known)}
            </div>
          </div>
        </div>
      ) : null}

      {card.kind === "bp" ? (
        <div className="grid gap-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2">
              Leader:
              <span className="font-mono text-foreground/80">{leaderLabel}</span>
              <button
                type="button"
                className="rounded-md border border-border bg-card px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground disabled:opacity-50"
                disabled={!card.leader}
                onClick={async () => {
                  if (!card.leader) return;
                  if (typeof navigator === "undefined" || !navigator.clipboard) return;
                  try {
                    await navigator.clipboard.writeText(card.leader);
                  } catch {
                    // Clipboard writes can fail in locked-down browser contexts.
                  }
                }}
              >
                Copy
              </button>
            </span>
            <span>
              Last applied: <span className="text-foreground/80">{formatSeconds(card.lastAppliedAgeSec ?? null)}</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Prod delay: <span className="text-foreground/80">{formatMilliseconds(card.avgProductionDelayMs ?? null)}</span>
            </span>
            <span>
              Verify delay: <span className="text-foreground/80">{formatMilliseconds(card.avgVerificationDelayMs ?? null)}</span>
            </span>
            <span>
              Tx/block: <span className="text-foreground/80">{card.avgTransactions?.toFixed(1) ?? "—"}</span>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
