import { NextResponse } from "next/server";
import type { NetworkKey } from "@/lib/config";
import {
  loadDashboardConfig,
  normalizeNetwork,
  readTimeoutMs,
} from "@/lib/server/dashboard";
import { buildBpCard, buildExplorerCard, buildRpcCard, resolveExplorerDocsUrl, resolveRpcDocsUrl } from "@/lib/server/cards";
import type { CardData } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DashboardResponse = {
  network: NetworkKey;
  defaultNetwork: NetworkKey;
  counts: { hosts: number; rpcs: number; explorers: number };
  cards: CardData[];
  maxHeight: number | null;
  supply: { soul: string | null; kcal: string | null; error?: string };
};

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
    const explorers = Object.entries(config.networks[network].explorers);

    const bpEntries = hosts.sort(([a], [b]) => a.localeCompare(b));
    const rpcEntries = rpcs.sort(([a], [b]) => a.localeCompare(b));
    const explorerEntries = explorers.sort(([a], [b]) => a.localeCompare(b));

    const shellCards: DashboardResponse["cards"] = [
      ...bpEntries.map(([key, entry], index) => ({
        id: `bp-${index}`,
        nodeKey: key,
        kind: "bp" as const,
        title: entry.title,
        height: null,
        role: entry.role ?? "Watcher",
      })),
      ...rpcEntries.map(([key, entry], index) => ({
        id: `rpc-${index}`,
        nodeKey: key,
        kind: "rpc" as const,
        title: entry.title,
        height: null,
        rpcDocsUrl: resolveRpcDocsUrl(entry.url),
      })),
      ...explorerEntries.map(([key, entry], index) => ({
        id: `explorer-${index}`,
        nodeKey: key,
        kind: "explorer" as const,
        title: entry.title ?? key,
        height: null,
        explorerUrl: entry.url,
        explorerApiUrl: resolveExplorerDocsUrl(entry.apiUrl),
      })),
    ];

    if (lite) {
      const response: DashboardResponse = {
        network,
        defaultNetwork: fallback,
        counts: { hosts: hosts.length, rpcs: rpcs.length, explorers: explorers.length },
        cards: shellCards,
        maxHeight: null,
        supply: { soul: null, kcal: null },
      };
      return NextResponse.json(response);
    }

    const [bpCards, rpcCards, explorerCards] = await Promise.all([
      Promise.all(
        bpEntries.map(([key, entry], index) =>
          buildBpCard({
            id: `bp-${index}`,
            nodeKey: key,
            entry,
            timeoutMs,
          })
        )
      ),
      Promise.all(
        rpcEntries.map(([key, entry], index) =>
          buildRpcCard({
            id: `rpc-${index}`,
            nodeKey: key,
            entry,
            timeoutMs,
          })
        )
      ),
      Promise.all(
        explorerEntries.map(([key, entry], index) =>
          buildExplorerCard({
            id: `explorer-${index}`,
            nodeKey: key,
            entry,
            timeoutMs,
          })
        )
      ),
    ]);

    const cards = [...bpCards, ...rpcCards, ...explorerCards];
    const heights = [...bpCards, ...rpcCards]
      .map((card) => card.height)
      .filter((height): height is number => height !== null);
    const maxHeight = heights.length ? Math.max(...heights) : null;

    const response: DashboardResponse = {
      network,
      defaultNetwork: fallback,
      counts: { hosts: hosts.length, rpcs: rpcs.length, explorers: explorers.length },
      cards,
      maxHeight,
      supply: { soul: null, kcal: null },
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: "Dashboard config unavailable" }, { status: 500 });
  }
}
