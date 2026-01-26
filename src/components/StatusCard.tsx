import type { CardData } from "@/lib/types";
import {
  computeDelta,
  formatDelta,
  formatHeight,
  formatMilliseconds,
  formatSeconds,
  getDeltaTone,
  getDelayToneSeconds,
  type DelayTone,
} from "@/lib/metrics";
import { Sparkline } from "@/components/Sparkline";
import { ClipboardCopy, ExternalLink, RotateCw } from "lucide-react";

const toneStyles: Record<ReturnType<typeof getDeltaTone>, string> = {
  neutral: "text-foreground",
  success: "text-emerald-600 dark:text-emerald-400",
  warning: "text-yellow-600 dark:text-yellow-400",
  danger: "text-red-600 dark:text-red-400",
};

const delayToneStyles: Record<DelayTone, string> = {
  neutral: "text-foreground/80",
  warning: "text-yellow-700 dark:text-yellow-400",
  danger: "text-red-600 dark:text-red-400",
};

const roleToneStyles: Record<"watcher" | "validator" | "neutral", string> = {
  watcher: "text-amber-700 dark:text-amber-300 border-amber-400/50",
  validator: "text-emerald-700 dark:text-emerald-300 border-emerald-400/50",
  neutral: "text-muted-foreground",
};

function truncateMiddle(value: string, head = 8, tail = 8): string {
  if (value.length <= head + tail + 1) {
    return value;
  }
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
// Render build timestamps in compact UTC to match server-provided timezone.
function formatBuildTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  const pad = (input: number) => input.toString().padStart(2, "0");
  return `${parsed.getUTCFullYear()}-${pad(parsed.getUTCMonth() + 1)}-${pad(parsed.getUTCDate())} ${pad(parsed.getUTCHours())}:${pad(parsed.getUTCMinutes())} UTC`;
}

// BP build strings start with compiler/platform details; show from build date onward.
function formatBpBuildVersion(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const match = value.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/);
  if (!match || match.index === undefined) {
    return value;
  }
  return value.slice(match.index).trim();
}

function resolveRoleTone(value: string | null | undefined) {
  const normalized = value?.toLowerCase() ?? "watcher";
  if (normalized === "watcher") {
    return "watcher";
  }
  if (normalized === "validator" || normalized === "producer" || normalized === "verifier") {
    return "validator";
  }
  return "neutral";
}

export function StatusCard({
  card,
  maxHeight,
  onRefresh,
  refreshing,
}: {
  card: CardData;
  maxHeight: number | null;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const delta = computeDelta(card.height, maxHeight);
  const tone = getDeltaTone(delta);
  const leaderLabel = card.leader ? truncateMiddle(card.leader) : "—";
  const roleTone = resolveRoleTone(card.role ?? "Watcher");
  const lastAppliedTone = getDelayToneSeconds(card.lastAppliedAgeSec ?? null);
  const productionDelayTone = getDelayToneSeconds(
    card.avgProductionDelayMs === null || card.avgProductionDelayMs === undefined
      ? null
      : card.avgProductionDelayMs / 1000
  );
  const verificationDelayTone = getDelayToneSeconds(
    card.avgVerificationDelayMs === null || card.avgVerificationDelayMs === undefined
      ? null
      : card.avgVerificationDelayMs / 1000
  );
  const rpcFirstTone = getDelayToneSeconds(
    card.rpcFirstResponseMs === null || card.rpcFirstResponseMs === undefined
      ? null
      : card.rpcFirstResponseMs / 1000
  );
  const rpcAverageTone = getDelayToneSeconds(
    card.rpcAverageResponseMs === null || card.rpcAverageResponseMs === undefined
      ? null
      : card.rpcAverageResponseMs / 1000
  );
  const explorerAgeTone = getDelayToneSeconds(card.explorerLastBlockAgeSec ?? null);
  const explorerRespTone = getDelayToneSeconds(
    card.explorerResponseMs === null || card.explorerResponseMs === undefined
      ? null
      : card.explorerResponseMs / 1000
  );

  const heightTitle =
    card.kind === "bp"
      ? "Applied height"
      : card.kind === "rpc"
        ? "RPC height"
        : "Explorer height";
  const deltaTitle = "Delta from max applied height across BP/RPC nodes";
  const linkUrl =
    card.kind === "explorer"
      ? card.explorerUrl
      : card.kind === "rpc"
        ? card.rpcDocsUrl
        : null;
  const linkLabel = card.kind === "explorer" ? "Open explorer" : "Open RPC API";

  return (
    <div className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="text-sm font-semibold text-foreground">{card.title}</div>
          {linkUrl ? (
            <a
              href={linkUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground"
              aria-label={linkLabel}
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
          <button
            type="button"
            className="rounded-md border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
            onClick={onRefresh}
            disabled={!onRefresh || refreshing}
            aria-label="Refresh node"
          >
            <RotateCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {card.kind}
          </span>
          {card.kind === "bp" ? (
            <span
              className={`rounded-full border bg-card px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${roleToneStyles[roleTone]}`}
            >
              {(card.role ?? "Watcher").toUpperCase()}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div>
          <div
            className={`text-3xl font-semibold ${toneStyles[tone]}`}
            title={heightTitle}
          >
            {formatHeight(card.height)}
          </div>
          <div
            className={`text-sm font-medium ${toneStyles[tone]}`}
            title={deltaTitle}
          >
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
          <div className="flex flex-col gap-1 leading-tight" title="Applied height">
            <div className="uppercase tracking-wide">Ap</div>
            <div className="font-mono text-foreground/80">
              {formatHeight(card.heights.applied)}
            </div>
          </div>
          <div className="flex flex-col gap-1 leading-tight" title="Committed height">
            <div className="uppercase tracking-wide">Com</div>
            <div className="font-mono text-foreground/80">
              {formatHeight(card.heights.committed)}
            </div>
          </div>
          <div className="flex flex-col gap-1 leading-tight" title="Proven height">
            <div className="uppercase tracking-wide">Pro</div>
            <div className="font-mono text-foreground/80">
              {formatHeight(card.heights.proven)}
            </div>
          </div>
          <div className="flex flex-col gap-1 leading-tight" title="Appended height">
            <div className="uppercase tracking-wide">App</div>
            <div className="font-mono text-foreground/80">
              {formatHeight(card.heights.appended)}
            </div>
          </div>
          <div className="flex flex-col gap-1 leading-tight" title="Known height">
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
                className="rounded-md border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
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
                aria-label="Copy leader address"
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
              </button>
            </span>
            <span>
              Last applied:{" "}
              <span className={delayToneStyles[lastAppliedTone]}>
                {formatSeconds(card.lastAppliedAgeSec ?? null)}
              </span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span>
              Prod delay:{" "}
              <span className={delayToneStyles[productionDelayTone]}>
                {formatMilliseconds(card.avgProductionDelayMs ?? null)}
              </span>
            </span>
            <span>
              Verify delay:{" "}
              <span className={delayToneStyles[verificationDelayTone]}>
                {formatMilliseconds(card.avgVerificationDelayMs ?? null)}
              </span>
            </span>
            <span>
              Tx/block:{" "}
              <span className="text-foreground/80">
                {card.avgTransactions?.toFixed(1) ?? "—"}
              </span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span>Build:</span>
            <span className="font-mono text-foreground/80 break-all">
              {formatBpBuildVersion(card.bpBuildVersion)}
            </span>
          </div>
        </div>
      ) : card.kind === "explorer" ? (
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span title="Latest block height from explorer">
            Last block:{" "}
            <span className="text-foreground/80">
              {formatHeight(card.explorerLastBlockHeight ?? null)}
            </span>
          </span>
          <span title="Age since the latest explorer block timestamp (UTC)">
            Block age:{" "}
            <span className={delayToneStyles[explorerAgeTone]}>
              {formatSeconds(card.explorerLastBlockAgeSec ?? null)}
            </span>
          </span>
          <span title="Explorer API response time">
            API resp:{" "}
            <span className={delayToneStyles[explorerRespTone]}>
              {formatMilliseconds(card.explorerResponseMs ?? null)}
            </span>
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <span>
            Version:{" "}
            <span className="text-foreground/80">{card.rpcVersion ?? "—"}</span>
          </span>
          <span title={card.rpcBuildTimeUtc ?? undefined}>
            Build:{" "}
            <span className="text-foreground/80">{formatBuildTime(card.rpcBuildTimeUtc)}</span>
          </span>
          <span className="col-span-2" title={card.rpcCommit ?? undefined}>
            Commit:{" "}
            <span className="font-mono text-foreground/80">
              {card.rpcCommit ? truncateMiddle(card.rpcCommit) : "—"}
            </span>
          </span>
          <span title="Response time for the first RPC call">
            Resp 1st:{" "}
            <span className={delayToneStyles[rpcFirstTone]}>
              {formatMilliseconds(card.rpcFirstResponseMs ?? null)}
            </span>
          </span>
          <span title="Average response time across up to 5 successful calls">
            Resp avg(5):{" "}
            <span className={delayToneStyles[rpcAverageTone]}>
              {formatMilliseconds(card.rpcAverageResponseMs ?? null)}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
