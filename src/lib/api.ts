import { isRecord, readArray, readNumber, readString } from "@/lib/validators";

export type BlockHeights = {
  applied: number;
  proven: number;
  committed: number;
  appended: number;
  known: number;
};

export type StatusBlock = {
  index: number;
  timeAppliedMs: number;
  productionDelayMs: number;
  verificationDelayMs: number;
  transactions: number;
  changes: number;
  raftLeader?: string;
  raftLeaderPha?: string;
};

export type TokenInfo = {
  symbol: string;
  decimals: number;
};

export type StatusSummary = {
  name?: string;
  nowMs?: number;
  cpu?: number;
  ram?: number;
  idPha?: string;
  blockRate?: {
    targetSlow?: number;
    target?: number;
    targetBurst?: number;
    averageActual?: number;
    productionTime?: number;
    lastBlockMs?: number;
  };
  blocks?: StatusBlock[];
  connectionsCount?: number;
  gasToken?: TokenInfo;
  dataToken?: TokenInfo;
};

export type RpcBuildInfo = {
  version: string | null;
  commit: string | null;
  buildTimeUtc: string | null;
};


const DEFAULT_TIMEOUT_MS = 15000;
// Retry transient network failures to reduce flaky dashboard status updates.
const DEFAULT_RETRY_OPTIONS = {
  retries: 2,
  delayMs: 300,
  backoffFactor: 2,
  retryStatuses: [408, 425, 429, 500, 502, 503, 504],
};

function withTimeout(timeoutMs: number) {
  // Use AbortController to avoid hanging requests on slow or unreachable hosts.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return { controller, timeoutId };
}

function shouldRetryError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "AbortError") {
    return true;
  }
  return /fetch failed|network error|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN/i.test(
    error.message
  );
}

function shouldRetryStatus(status: number): boolean {
  return DEFAULT_RETRY_OPTIONS.retryStatuses.includes(status);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  let attempt = 0;
  let delayMs = DEFAULT_RETRY_OPTIONS.delayMs;

  while (true) {
    const { controller, timeoutId } = withTimeout(timeoutMs);
    try {
      const response = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        if (shouldRetryStatus(response.status) && attempt < DEFAULT_RETRY_OPTIONS.retries) {
          attempt += 1;
          await delay(delayMs);
          delayMs *= DEFAULT_RETRY_OPTIONS.backoffFactor;
          continue;
        }
        throw new Error(`HTTP ${response.status}`);
      }
      return response;
    } catch (error) {
      if (shouldRetryError(error) && attempt < DEFAULT_RETRY_OPTIONS.retries) {
        attempt += 1;
        await delay(delayMs);
        delayMs *= DEFAULT_RETRY_OPTIONS.backoffFactor;
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

async function fetchJson(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
  const response = await fetchWithRetry(url, {}, timeoutMs);
  try {
    return await response.json();
  } catch {
    const text = await response.text();
    const trimmed = text.trim();
    if (trimmed && trimmed.length <= 120) {
      throw new Error(trimmed);
    }
    throw new Error("Unexpected response");
  }
}

function parseBlockHeights(payload: unknown): BlockHeights {
  if (!isRecord(payload)) {
    throw new Error("Block heights response must be an object");
  }

  if (payload.error) {
    const errorText =
      typeof payload.error === "string"
        ? payload.error
        : isRecord(payload.error) && typeof payload.error.message === "string"
          ? payload.error.message
          : "Block heights error";
    throw new Error(errorText);
  }

  const source = isRecord(payload.result) ? payload.result : payload;

  const applied = readNumber(source.applied);
  const proven = readNumber(source.proven);
  const committed = readNumber(source.committed);
  const appended = readNumber(source.appended);
  const known = readNumber(source.known);

  if (
    applied === null ||
    proven === null ||
    committed === null ||
    appended === null ||
    known === null
  ) {
    throw new Error("Block heights response missing numeric fields");
  }

  return { applied, proven, committed, appended, known };
}

function parseTokenInfo(payload: unknown): TokenInfo | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }
  const symbol = readString(payload.symbol);
  const decimals = readNumber(payload.decimals);
  if (!symbol || decimals === null) {
    return undefined;
  }
  return { symbol, decimals };
}

function parseBlockRate(payload: unknown): StatusSummary["blockRate"] {
  if (!isRecord(payload)) {
    return undefined;
  }
  return {
    targetSlow: readNumber(payload.target_slow) ?? undefined,
    target: readNumber(payload.target) ?? undefined,
    targetBurst: readNumber(payload.target_burst) ?? undefined,
    averageActual: readNumber(payload.average_actual) ?? undefined,
    productionTime: readNumber(payload.production_time) ?? undefined,
    lastBlockMs: readNumber(payload.last_block) ?? undefined,
  };
}

function parseBlocks(payload: unknown): StatusBlock[] | undefined {
  const blocksRaw = readArray(payload);
  if (!blocksRaw) {
    return undefined;
  }

  const blocks: StatusBlock[] = [];
  for (const entry of blocksRaw) {
    if (!isRecord(entry)) {
      continue;
    }
    const index = readNumber(entry.index);
    const timeApplied = readNumber(entry.time_applied);
    const productionDelay = readNumber(entry.production_delay);
    const verificationDelay = readNumber(entry.verification_delay);
    const transactions = readNumber(entry.num_transactions);
    const changes = readNumber(entry.num_changes);
    if (
      index === null ||
      timeApplied === null ||
      productionDelay === null ||
      verificationDelay === null ||
      transactions === null ||
      changes === null
    ) {
      continue;
    }

    blocks.push({
      index,
      timeAppliedMs: timeApplied,
      productionDelayMs: productionDelay,
      verificationDelayMs: verificationDelay,
      transactions,
      changes,
      raftLeader: readString(entry.raft_leader) ?? undefined,
      raftLeaderPha: readString(entry.raft_leader_pha) ?? undefined,
    });
  }

  return blocks.length ? blocks : undefined;
}

function parseStatus(payload: unknown): StatusSummary {
  if (!isRecord(payload)) {
    throw new Error("Status response must be an object");
  }

  const result = payload.result;
  if (!isRecord(result)) {
    throw new Error("Status response missing result");
  }

  return {
    name: readString(result.name) ?? undefined,
    nowMs: readNumber(result.now) ?? undefined,
    cpu: readNumber(result.cpu) ?? undefined,
    ram: readNumber(result.ram) ?? undefined,
    idPha: readString(result.id_pha) ?? undefined,
    blockRate: parseBlockRate(result.block_rate),
    blocks: parseBlocks(result.blocks),
    connectionsCount: Array.isArray(result.connections)
      ? result.connections.length
      : undefined,
    gasToken: parseTokenInfo(result.gas_token),
    dataToken: parseTokenInfo(result.data_token),
  };
}

export async function fetchBlockHeights(
  baseUrl: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<BlockHeights> {
  const payload = await fetchJson(`${baseUrl}v1/block_heights?format=json`, timeoutMs);
  return parseBlockHeights(payload);
}

export async function fetchStatusSummary(
  baseUrl: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<StatusSummary> {
  const payload = await fetchJson(`${baseUrl}v1/status?format=json`, timeoutMs);
  return parseStatus(payload);
}

function parseRpcBuildInfo(payload: unknown): RpcBuildInfo {
  if (!isRecord(payload)) {
    throw new Error("RPC response must be an object");
  }

  if (payload.error) {
    const errorText =
      typeof payload.error === "string"
        ? payload.error
        : isRecord(payload.error) && typeof payload.error.message === "string"
          ? payload.error.message
          : "RPC returned error";
    throw new Error(errorText);
  }

  const result = isRecord(payload.result) ? payload.result : null;
  if (!result) {
    throw new Error("RPC result missing build info");
  }

  return {
    version: readString(result.version),
    commit: readString(result.commit),
    buildTimeUtc: readString(result.buildTimeUtc),
  };
}

export async function fetchRpcVersion(
  rpcUrl: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<RpcBuildInfo> {
  const response = await fetchWithRetry(
    rpcUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "getVersion",
        params: [],
        id: 1,
      }),
    },
    timeoutMs
  );

  const payload: unknown = await response.json();
  return parseRpcBuildInfo(payload);
}

export async function fetchRpcHeight(
  rpcUrl: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<number> {
  // Explicit JSON-RPC call keeps behavior predictable across RPC implementations.
  const response = await fetchWithRetry(
    rpcUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "getBlockHeight",
        params: ["main"],
        id: 1,
      }),
    },
    timeoutMs
  );

  const payload: unknown = await response.json();
  if (!isRecord(payload)) {
    throw new Error("RPC response must be an object");
  }
  if (payload.error) {
    throw new Error("RPC returned error");
  }
  const result = readNumber(payload.result);
  if (result === null) {
    throw new Error("RPC result missing numeric height");
  }
  return result;
}

export async function fetchTokenSupply(
  apiBase: string,
  symbol: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<string> {
  const query = new URLSearchParams({
    symbol,
    chain: "main",
    limit: "1",
    offset: "0",
    with_total: "0",
  });

  const payload = await fetchJson(`${apiBase}/tokens?${query.toString()}`, timeoutMs);
  if (!isRecord(payload)) {
    throw new Error("Explorer response must be an object");
  }
  const tokens = readArray(payload.tokens);
  if (!tokens || tokens.length === 0 || !isRecord(tokens[0])) {
    throw new Error("Explorer response missing tokens");
  }
  const supply = readString(tokens[0].current_supply);
  if (!supply) {
    throw new Error("Explorer response missing supply");
  }
  return supply;
}
