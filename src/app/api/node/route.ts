import { NextResponse } from "next/server";
import { buildBpCard, buildRpcCard } from "@/lib/server/cards";
import {
  loadDashboardConfig,
  normalizeNetwork,
  readTimeoutMs,
} from "@/lib/server/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const timeoutMs = readTimeoutMs();
  const kind = url.searchParams.get("kind");
  const key = url.searchParams.get("key");

  if (!key || (kind !== "bp" && kind !== "rpc")) {
    return NextResponse.json({ error: "Invalid node selection" }, { status: 400 });
  }

  try {
    const config = await loadDashboardConfig();
    const fallback = config.defaultNetwork ?? "mainnet";
    const network = normalizeNetwork(url.searchParams.get("network"), fallback);

    if (kind === "bp") {
      const entry = config.networks[network].hosts[key];
      if (!entry) {
        return NextResponse.json({ error: "Unknown host" }, { status: 404 });
      }
      const card = await buildBpCard({
        id: `bp-${key}`,
        nodeKey: key,
        entry,
        timeoutMs,
      });
      return NextResponse.json({ network, card });
    }

    const entry = config.networks[network].rpcs[key];
    if (!entry) {
      return NextResponse.json({ error: "Unknown RPC" }, { status: 404 });
    }
    const card = await buildRpcCard({
      id: `rpc-${key}`,
      nodeKey: key,
      entry,
      timeoutMs,
    });
    return NextResponse.json({ network, card });
  } catch {
    return NextResponse.json({ error: "Dashboard config unavailable" }, { status: 500 });
  }
}
