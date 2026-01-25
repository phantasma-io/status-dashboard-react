import { NextResponse } from "next/server";
import { fetchTokenSupply } from "@/lib/api";
import type { NetworkKey } from "@/lib/config";
import {
  explorerApiByNetwork,
  loadDashboardConfig,
  normalizeNetwork,
  readTimeoutMs,
  sanitizeError,
} from "@/lib/server/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SupplyResponse = {
  network: NetworkKey;
  defaultNetwork: NetworkKey;
  supply: { soul: string | null; kcal: string | null; error?: string };
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const timeoutMs = readTimeoutMs();

  try {
    const config = await loadDashboardConfig();
    const fallback = config.defaultNetwork ?? "mainnet";
    const network = normalizeNetwork(url.searchParams.get("network"), fallback);
    const apiBase = explorerApiByNetwork[network];

    let supply: SupplyResponse["supply"] = { soul: null, kcal: null };
    try {
      const [soul, kcal] = await Promise.all([
        fetchTokenSupply(apiBase, "SOUL", timeoutMs),
        fetchTokenSupply(apiBase, "KCAL", timeoutMs),
      ]);
      supply = { soul, kcal };
    } catch (err) {
      const message = sanitizeError(err);
      supply = {
        soul: null,
        kcal: null,
        error: message === "HTTP 404" ? "Supply unavailable" : message,
      };
    }

    const response: SupplyResponse = {
      network,
      defaultNetwork: fallback,
      supply,
    };

    return NextResponse.json(response);
  } catch {
    return NextResponse.json({ error: "Supply unavailable" }, { status: 500 });
  }
}
