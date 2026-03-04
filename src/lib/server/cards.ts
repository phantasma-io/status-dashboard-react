import type {
  BlockHeights,
  ExplorerLatestBlock,
  PavillionApiHealth,
  PavillionClientBuild,
  PavillionClientConfig,
  PavillionRpcPeer,
  PavillionShopHealth,
  PavillionStatus,
  RpcBuildInfo,
  StatusSummary,
} from "@/lib/api";
import {
  fetchBlockHeights,
  fetchExplorerLatestBlock,
  fetchPavillionApiHealth,
  fetchPavillionClientBuild,
  fetchPavillionClientConfig,
  fetchPavillionRpcPeers,
  fetchPavillionShopHealth,
  fetchPavillionStatus,
  fetchRpcHeight,
  fetchRpcVersion,
  fetchStatusSummary,
} from "@/lib/api";
import type { ExplorerEntry, HostEntry, PavillionEntry, RpcEntry } from "@/lib/config";
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

type PavillionCardOptions = {
  id: string;
  nodeKey: string;
  entry: PavillionEntry;
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

function baseCard(options: {
  id: string;
  nodeKey: string;
  kind: CardData["kind"];
  title: string;
  height: number | null;
}): CardData {
  return {
    id: options.id,
    nodeKey: options.nodeKey,
    kind: options.kind,
    title: options.title,
    height: options.height,
  };
}

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
    parts.pop();
    url.pathname = `/${parts.join("/")}` || "/";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function resolveExplorerDocsUrl(apiUrl: string): string | null {
  try {
    const url = new URL(apiUrl);
    const trimmed = url.pathname.replace(/\/+$/g, "");
    const suffix = "/api/v1";
    if (!trimmed.endsWith(suffix)) {
      return url.toString();
    }
    const nextPath = trimmed.slice(0, -suffix.length) || "/";
    url.pathname = nextPath;
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

function inferNetworkFromText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.toLowerCase();
  if (normalized.includes("testnet")) {
    return "testnet";
  }
  if (normalized.includes("devnet")) {
    return "devnet";
  }
  if (normalized.includes("mainnet")) {
    return "mainnet";
  }
  if (normalized.includes("api.phantasma.info") || normalized.includes("explorer.phantasma.info")) {
    return "mainnet";
  }
  return null;
}

function inferPavillionNetwork(options: {
  expectedNetwork?: string;
  rpcPeers: PavillionRpcPeer[] | null;
  clientConfig: PavillionClientConfig | null;
}): string | null {
  const expected = inferNetworkFromText(options.expectedNetwork ?? null);
  if (expected) {
    return expected;
  }
  const fromConfig = inferNetworkFromText(options.clientConfig?.api ?? null);
  if (fromConfig) {
    return fromConfig;
  }
  for (const peer of options.rpcPeers ?? []) {
    const fromPeer = inferNetworkFromText(peer.url);
    if (fromPeer) {
      return fromPeer;
    }
  }
  return null;
}

export async function buildBpHeightsCard({
  id,
  nodeKey,
  entry,
  timeoutMs,
}: BpCardOptions): Promise<CardData> {
  let heights: BlockHeights | null = null;
  let error: string | null = null;

  try {
    heights = await fetchBlockHeights(entry.url, timeoutMs);
  } catch (err) {
    error = sanitizeError(err);
  }

  return {
    ...baseCard({
      id,
      nodeKey,
      kind: "bp",
      title: entry.title,
      height: heights?.applied ?? null,
    }),
    heights,
    error,
  };
}

export async function buildBpStatusCard({
  id,
  nodeKey,
  entry,
  timeoutMs,
}: BpCardOptions): Promise<CardData> {
  let status: StatusSummary | null = null;
  let error: string | null = null;

  try {
    status = await fetchStatusSummary(entry.url, timeoutMs);
  } catch (err) {
    error = sanitizeError(err);
  }

  const summary = summarizeBlocks(status);

  return {
    ...baseCard({
      id,
      nodeKey,
      kind: "bp",
      title: entry.title,
      height: null,
    }),
    bpBuildVersion: status?.appVersion ?? null,
    leader: summary.leader,
    lastAppliedAgeSec: summary.lastAppliedAgeSec,
    avgProductionDelayMs: summary.avgProductionDelayMs,
    avgVerificationDelayMs: summary.avgVerificationDelayMs,
    avgTransactions: summary.avgTransactions,
    sparkline: summary.sparkline,
    error,
  };
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
    ...baseCard({
      id,
      nodeKey,
      kind: "bp",
      title: entry.title,
      height: heights?.applied ?? null,
    }),
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

export async function buildRpcHeightCard({
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
    ...baseCard({
      id,
      nodeKey,
      kind: "rpc",
      title: entry.title,
      height,
    }),
    error,
  };
}

export async function buildRpcVersionCard({
  id,
  nodeKey,
  entry,
  timeoutMs,
}: RpcCardOptions): Promise<CardData> {
  let info: RpcBuildInfo | null = null;
  let error: string | null = null;

  try {
    info = await fetchRpcVersion(entry.url, timeoutMs);
  } catch (err) {
    error = sanitizeError(err);
  }

  return {
    ...baseCard({
      id,
      nodeKey,
      kind: "rpc",
      title: entry.title,
      height: null,
    }),
    rpcVersion: info?.version ?? null,
    rpcCommit: info?.commit ?? null,
    rpcBuildTimeUtc: info?.buildTimeUtc ?? null,
    error,
  };
}

export async function buildRpcLatencyCard({
  id,
  nodeKey,
  entry,
  timeoutMs,
}: RpcCardOptions): Promise<CardData> {
  const firstSample = await sampleRpcVersion(entry.url, timeoutMs);
  const extraSamples = await Promise.all(
    Array.from({ length: 4 }, () => sampleRpcVersion(entry.url, timeoutMs))
  );

  const samples = [firstSample, ...extraSamples];
  const successful = samples.filter((sample) => sample.info !== null);
  const durations = successful.map((sample) => sample.durationMs);
  const avgResponseMs =
    durations.length > 0
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : null;

  return {
    ...baseCard({
      id,
      nodeKey,
      kind: "rpc",
      title: entry.title,
      height: null,
    }),
    rpcFirstResponseMs: firstSample.durationMs,
    rpcAverageResponseMs: avgResponseMs,
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
    ...baseCard({
      id,
      nodeKey,
      kind: "rpc",
      title: entry.title,
      height: heightResult.height,
    }),
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
    ...baseCard({
      id,
      nodeKey,
      kind: "explorer",
      title: entry.title ?? nodeKey,
      height,
    }),
    explorerUrl: entry.url,
    explorerApiUrl: resolveExplorerDocsUrl(entry.apiUrl),
    explorerLastBlockHeight: lastBlockHeight,
    explorerLastBlockAgeSec: lastBlockAgeSec,
    explorerResponseMs: responseMs,
    error,
  };
}

export async function buildPavillionCard({
  id,
  nodeKey,
  entry,
  timeoutMs,
}: PavillionCardOptions): Promise<CardData> {
  const [
    apiHealthResult,
    statusResult,
    rpcPeersResult,
    clientBuildResult,
    clientConfigResult,
    shopHealthResult,
  ] = await Promise.all([
    runTimed(() => fetchPavillionApiHealth(entry.apiUrl, timeoutMs)),
    runTimed(() => fetchPavillionStatus(entry.apiUrl, timeoutMs)),
    runTimed(() => fetchPavillionRpcPeers(entry.apiUrl, timeoutMs)),
    runTimed(() => fetchPavillionClientBuild(entry.clientUrl, timeoutMs)),
    runTimed(() => fetchPavillionClientConfig(entry.clientUrl, timeoutMs)),
    entry.shopUrl
      ? runTimed(() => fetchPavillionShopHealth(entry.shopUrl as string, timeoutMs))
      : Promise.resolve<TimedResult<PavillionShopHealth>>({
          durationMs: 0,
          value: null,
          error: null,
        }),
  ]);

  const apiHealth: PavillionApiHealth | null = apiHealthResult.value;
  const status: PavillionStatus | null = statusResult.value;
  const rpcPeers: PavillionRpcPeer[] | null = rpcPeersResult.value;
  const clientBuild: PavillionClientBuild | null = clientBuildResult.value;
  const clientConfig: PavillionClientConfig | null = clientConfigResult.value;
  const shopHealth: PavillionShopHealth | null = shopHealthResult.value;

  const statusAgeSec =
    status?.timestamp === null || status?.timestamp === undefined
      ? null
      : Math.max(0, Date.now() / 1000 - status.timestamp);
  const primaryPeer = rpcPeers && rpcPeers.length > 0 ? rpcPeers[0] : null;
  const network = inferPavillionNetwork({
    expectedNetwork: entry.expectedNetwork,
    rpcPeers,
    clientConfig,
  });

  const hasApiHealth = apiHealth !== null;
  const hasStatus = status !== null;
  const hasRpcPeers = Boolean(rpcPeers && rpcPeers.length > 0);
  const hasClientBuild = clientBuild !== null;
  const hasShopHealth = entry.shopUrl ? shopHealth !== null : null;
  const statusOk = status?.ok === true;
  const overallOk =
    hasApiHealth &&
    hasStatus &&
    hasRpcPeers &&
    hasClientBuild &&
    hasShopHealth !== false &&
    statusOk;

  const apiError = apiHealthResult.error ? sanitizeError(apiHealthResult.error) : null;
  const statusError = statusResult.error ? sanitizeError(statusResult.error) : null;
  const rpcError = rpcPeersResult.error ? sanitizeError(rpcPeersResult.error) : null;
  const clientError = clientBuildResult.error ? sanitizeError(clientBuildResult.error) : null;
  const shopError = shopHealthResult.error ? sanitizeError(shopHealthResult.error) : null;

  const configError = clientConfigResult.error ? sanitizeError(clientConfigResult.error) : null;
  const error = apiError ?? statusError ?? rpcError ?? clientError ?? configError ?? shopError;

  return {
    ...baseCard({
      id,
      nodeKey,
      kind: "pavillion",
      title: entry.title,
      height: null,
    }),
    pavNetwork: network,
    pavOverallOk: overallOk,
    pavStatusAgeSec: statusAgeSec,
    pavSecureNodes: status?.secureNodes ?? null,
    pavOutagesCount: status?.outagesCount ?? null,
    pavRpcPeerCount: rpcPeers?.length ?? null,
    pavRpcPrimary: primaryPeer?.url ?? null,
    pavApiUrl: entry.apiUrl,
    pavApiProbeOk: hasApiHealth,
    pavApiError: apiError,
    pavApiUptimeSec: apiHealth?.uptimeSeconds ?? null,
    pavApiBuildTime: apiHealth?.buildTime ?? null,
    pavApiBuildCommit: apiHealth?.buildCommit ?? null,
    pavApiBuildVersion: apiHealth?.buildVersion ?? null,
    pavClientUrl: entry.clientUrl,
    pavClientProbeOk: hasClientBuild,
    pavClientError: clientError,
    pavClientApiUrl: clientConfig?.api ?? null,
    pavClientBuildTime: clientBuild?.buildTime ?? null,
    pavClientBuildCommit: clientBuild?.buildCommit ?? null,
    pavClientBuildBranch: clientBuild?.buildBranch ?? null,
    pavClientAppVersion: clientBuild?.appVersion ?? null,
    pavClientSdkVersion: clientBuild?.sdkVersion ?? null,
    pavShopUrl: entry.shopUrl ?? null,
    pavShopProbeOk: hasShopHealth,
    pavShopError: shopError,
    pavShopUptimeSec: shopHealth?.uptimeSeconds ?? null,
    pavShopBuildVersion: shopHealth?.buildVersion ?? null,
    pavShopBuildCommit: shopHealth?.buildCommit ?? null,
    pavStatusProbeOk: hasStatus,
    pavStatusOk: status?.ok ?? null,
    pavStatusError: statusError,
    pavRpcProbeOk: hasRpcPeers,
    pavRpcError: rpcError,
    error,
  };
}
