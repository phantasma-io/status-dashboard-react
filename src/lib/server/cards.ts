import type { BlockHeights, StatusSummary } from "@/lib/api";
import { fetchBlockHeights, fetchRpcHeight, fetchStatusSummary } from "@/lib/api";
import type { HostEntry, RpcEntry } from "@/lib/config";
import type { CardData } from "@/lib/types";
import { sanitizeError } from "@/lib/server/dashboard";

function summarizeBlocks(status: StatusSummary | null) {
  if (!status?.blocks || status.blocks.length === 0) {
    return {
      leader: null,
      lastAppliedAgeSec: null,
      avgProductionDelayMs: null,
      avgVerificationDelayMs: null,
      avgTransactions: null,
      sparkline: null as number[] | null,
    };
  }

  const blocks = status.blocks;
  const last = blocks[blocks.length - 1];
  const now = status.nowMs ?? Date.now();
  const lastAppliedAgeSec = Math.max(0, (now - last.timeAppliedMs) / 1000);
  const productionDelays = blocks.map((block) => block.productionDelayMs);
  const verificationDelays = blocks.map((block) => block.verificationDelayMs);
  const transactions = blocks.map((block) => block.transactions);

  const avg = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    leader: last.raftLeaderPha ?? last.raftLeader ?? null,
    lastAppliedAgeSec,
    avgProductionDelayMs: avg(productionDelays),
    avgVerificationDelayMs: avg(verificationDelays),
    avgTransactions: avg(transactions),
    sparkline: productionDelays,
  };
}

type BpCardOptions = {
  id: string;
  nodeKey: string;
  entry: HostEntry;
  timeoutMs: number;
};

type RpcCardOptions = {
  id: string;
  nodeKey: string;
  entry: RpcEntry;
  timeoutMs: number;
};

export async function buildBpCard({
  id,
  nodeKey,
  entry,
  timeoutMs,
}: BpCardOptions): Promise<CardData> {
  let heights: BlockHeights | null = null;
  let status: StatusSummary | null = null;
  let error: string | null = null;

  const [heightsResult, statusResult] = await Promise.allSettled([
    fetchBlockHeights(entry.url, timeoutMs),
    fetchStatusSummary(entry.url, timeoutMs),
  ]);

  if (heightsResult.status === "fulfilled") {
    heights = heightsResult.value;
  } else {
    error = sanitizeError(heightsResult.reason);
  }

  if (statusResult.status === "fulfilled") {
    status = statusResult.value;
  } else {
    error = error ?? sanitizeError(statusResult.reason);
  }

  const summary = summarizeBlocks(status);

  return {
    id,
    nodeKey,
    kind: "bp",
    title: entry.title,
    height: heights?.applied ?? null,
    heights,
    leader: summary.leader,
    lastAppliedAgeSec: summary.lastAppliedAgeSec,
    avgProductionDelayMs: summary.avgProductionDelayMs,
    avgVerificationDelayMs: summary.avgVerificationDelayMs,
    avgTransactions: summary.avgTransactions,
    sparkline: summary.sparkline,
    role: entry.role ?? "Watcher",
    error,
  };
}

export async function buildRpcCard({
  id,
  nodeKey,
  entry,
  timeoutMs,
}: RpcCardOptions): Promise<CardData> {
  let height: number | null = null;
  let error: string | null = null;

  try {
    height = await fetchRpcHeight(entry.url, timeoutMs);
  } catch (err) {
    error = sanitizeError(err);
  }

  return {
    id,
    nodeKey,
    kind: "rpc",
    title: entry.title,
    height,
    error,
  };
}
