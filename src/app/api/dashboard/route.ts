import { NextResponse } from "next/server";
import { fetchBlockHeights, fetchRpcHeight, fetchStatusSummary } from "@/lib/api";
import type { NetworkKey } from "@/lib/config";
import {
  loadDashboardConfig,
  normalizeNetwork,
  readTimeoutMs,
  sanitizeError,
} from "@/lib/server/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DashboardResponse = {
  network: NetworkKey;
  defaultNetwork: NetworkKey;
  counts: { hosts: number; rpcs: number };
  cards: Array<{
    id: string;
    kind: "bp" | "rpc";
    title: string;
    height: number | null;
    heights?: {
      applied: number;
      proven: number;
      committed: number;
      appended: number;
      known: number;
    } | null;
    leader?: string | null;
    lastAppliedAgeSec?: number | null;
    avgProductionDelayMs?: number | null;
    avgVerificationDelayMs?: number | null;
    avgTransactions?: number | null;
    sparkline?: number[] | null;
    role?: string | null;
    error?: string | null;
  }>;
  maxHeight: number | null;
  supply: { soul: string | null; kcal: string | null; error?: string };
};

function summarizeBlocks(status: Awaited<ReturnType<typeof fetchStatusSummary>> | null) {
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const timeoutMs = readTimeoutMs();
  const lite = url.searchParams.get("lite") === "1";

  try {
    const config = await loadDashboardConfig();
    const fallback = config.defaultNetwork ?? "mainnet";
    const network = normalizeNetwork(url.searchParams.get("network"), fallback);
    const hosts = Object.entries(config.networks[network].hosts);
    const rpcs = Object.entries(config.networks[network].rpcs);

    const bpEntries = hosts.sort(([a], [b]) => a.localeCompare(b));
    const rpcEntries = rpcs.sort(([a], [b]) => a.localeCompare(b));

    const shellCards: DashboardResponse["cards"] = [
      ...bpEntries.map((entry, index) => ({
        id: `bp-${index}`,
        kind: "bp" as const,
        title: entry[1].title,
        height: null,
        role: entry[1].role ?? "Watcher",
      })),
      ...rpcEntries.map((entry, index) => ({
        id: `rpc-${index}`,
        kind: "rpc" as const,
        title: entry[1].title,
        height: null,
      })),
    ];

    if (lite) {
      const response: DashboardResponse = {
        network,
        defaultNetwork: fallback,
        counts: { hosts: hosts.length, rpcs: rpcs.length },
        cards: shellCards,
        maxHeight: null,
        supply: { soul: null, kcal: null },
      };
      return NextResponse.json(response);
    }

    const bpCards = await Promise.all(
      bpEntries.map(async ([key, entry], index) => {
        let heights = null;
        let status = null;
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
          id: `bp-${index}`,
          kind: "bp" as const,
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
      })
    );

    const rpcCards = await Promise.all(
      rpcEntries.map(async ([key, entry], index) => {
        let height: number | null = null;
        let error: string | null = null;
        try {
          height = await fetchRpcHeight(entry.url, timeoutMs);
        } catch (err) {
          error = sanitizeError(err);
        }
        return {
          id: `rpc-${index}`,
          kind: "rpc" as const,
          title: entry.title,
          height,
          error,
        };
      })
    );

    const cards = [...bpCards, ...rpcCards];
    const heights = cards
      .map((card) => card.height)
      .filter((height): height is number => height !== null);
    const maxHeight = heights.length ? Math.max(...heights) : null;

    const response: DashboardResponse = {
      network,
      defaultNetwork: fallback,
      counts: { hosts: hosts.length, rpcs: rpcs.length },
      cards,
      maxHeight,
      supply: { soul: null, kcal: null },
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: "Dashboard config unavailable" }, { status: 500 });
  }
}
