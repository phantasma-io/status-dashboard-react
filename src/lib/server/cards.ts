import type {
  BlockHeights,
  ExplorerLatestBlock,
  RpcBuildInfo,
  StatusSummary,
} from "@/lib/api";
import {
  fetchBlockHeights,
  fetchExplorerLatestBlock,
  fetchRpcHeight,
  fetchRpcVersion,
  fetchStatusSummary,
} from "@/lib/api";
import type { ExplorerEntry, HostEntry, RpcEntry } from "@/lib/config";
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
  includeLatencySamples?: boolean;
};

type ExplorerCardOptions = {
  id: string;
  nodeKey: string;
  entry: ExplorerEntry;
  timeoutMs: number;
};

type RpcVersionSample = {
  durationMs: number;
  info: RpcBuildInfo | null;
  error: unknown | null;
};

type TimedResult<T> = {
  durationMs: number;
  value: T | null;
  error: unknown | null;
};

export function resolveRpcDocsUrl(rpcUrl: string): string | null {
  try {
    const url = new URL(rpcUrl);
    const trimmed = url.pathname.replace(/\/+$/g, "");
    const parts = trimmed.split("/").filter(Boolean);
    if (parts.length === 0) {
      return null;
    }
    if (parts[parts.length - 1] !== "rpc") {
      return null;
    }
    parts[parts.length - 1] = "api";
    parts.push("v1");
    url.pathname = `/${parts.join("/")}`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

// Use GetVersion for latency sampling to avoid extra chain-state work on RPC nodes.
async function sampleRpcVersion(
  rpcUrl: string,
  timeoutMs: number
): Promise<RpcVersionSample> {
  const start = Date.now();
  try {
    const info = await fetchRpcVersion(rpcUrl, timeoutMs);
    return { durationMs: Date.now() - start, info, error: null };
  } catch (error) {
    return { durationMs: Date.now() - start, info: null, error };
  }
}

async function runTimed<T>(action: () => Promise<T>): Promise<TimedResult<T>> {
  const start = Date.now();
  try {
    const value = await action();
    return { durationMs: Date.now() - start, value, error: null };
  } catch (error) {
    return { durationMs: Date.now() - start, value: null, error };
  }
}

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
    bpBuildVersion: status?.appVersion ?? null,
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
  includeLatencySamples,
}: RpcCardOptions): Promise<CardData> {
  const shouldSampleLatency = includeLatencySamples ?? true;
  const heightPromise = fetchRpcHeight(entry.url, timeoutMs)
    .then((height) => ({ height, error: null as unknown | null }))
    .catch((error) => ({ height: null, error }));

  const firstSample = await sampleRpcVersion(entry.url, timeoutMs);
  const extraSamples = shouldSampleLatency
    ? await Promise.all(
        Array.from({ length: 4 }, () => sampleRpcVersion(entry.url, timeoutMs))
      )
    : [];
  const heightResult = await heightPromise;

  const samples = [firstSample, ...extraSamples];
  const successful = samples.filter((sample) => sample.info !== null);
  const durations = successful.map((sample) => sample.durationMs);
  const avgResponseMs =
    shouldSampleLatency && durations.length > 0
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : null;
  const versionInfo = successful[0]?.info ?? null;
  const versionError =
    successful.length > 0
      ? null
      : sanitizeError(firstSample.error ?? extraSamples.find((sample) => sample.error)?.error);
  const heightError = heightResult.error ? sanitizeError(heightResult.error) : null;

  return {
    id,
    nodeKey,
    kind: "rpc",
    title: entry.title,
    height: heightResult.height,
    rpcFirstResponseMs: firstSample.durationMs,
    rpcAverageResponseMs: avgResponseMs,
    rpcVersion: versionInfo?.version ?? null,
    rpcCommit: versionInfo?.commit ?? null,
    rpcBuildTimeUtc: versionInfo?.buildTimeUtc ?? null,
    rpcDocsUrl: resolveRpcDocsUrl(entry.url),
    error: heightError ?? versionError,
  };
}

export async function buildExplorerCard({
  id,
  nodeKey,
  entry,
  timeoutMs,
}: ExplorerCardOptions): Promise<CardData> {
  let error: string | null = null;

  const blockResult = await runTimed(() => fetchExplorerLatestBlock(entry.apiUrl, timeoutMs));
  const blockInfo: ExplorerLatestBlock | null = blockResult.value;
  const height = blockInfo?.height ?? null;
  const lastBlockHeight = blockInfo?.height ?? null;
  const lastBlockAgeSec =
    blockInfo?.dateSec === null || blockInfo?.dateSec === undefined
      ? null
      : Math.max(0, Date.now() / 1000 - blockInfo.dateSec);

  const responseMs = blockResult.error ? null : blockResult.durationMs;

  if (blockResult.error) {
    error = sanitizeError(blockResult.error);
  }

  return {
    id,
    nodeKey,
    kind: "explorer",
    title: entry.title ?? nodeKey,
    height,
    explorerUrl: entry.url,
    explorerLastBlockHeight: lastBlockHeight,
    explorerLastBlockAgeSec: lastBlockAgeSec,
    explorerResponseMs: responseMs,
    error,
  };
}
