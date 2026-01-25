import type { BlockHeights, StatusSummary } from "@/lib/api";

export type CardKind = "bp" | "rpc";

export type CardData = {
  id: string;
  nodeKey?: string;
  kind: CardKind;
  title: string;
  height: number | null;
  rpcFirstResponseMs?: number | null;
  rpcAverageResponseMs?: number | null;
  rpcVersion?: string | null;
  bpBuildVersion?: string | null;
  rpcCommit?: string | null;
  rpcBuildTimeUtc?: string | null;
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
