import { readFile } from "node:fs/promises";
import path from "node:path";
import { NETWORKS, parseDashboardConfig, type DashboardConfig, type NetworkKey } from "@/lib/config";

export function normalizeNetwork(value: string | null, fallback: NetworkKey): NetworkKey {
  if (value && NETWORKS.includes(value as NetworkKey)) {
    return value as NetworkKey;
  }
  return fallback;
}

export function readTimeoutMs() {
  const raw = process.env.DASHBOARD_TIMEOUT_MS;
  if (!raw) return 8000;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8000;
}

export async function loadDashboardConfig() {
  const configPath =
    process.env.DASHBOARD_CONFIG_PATH ??
    path.join(process.cwd(), "config", "hosts.json");
  const raw = await readFile(configPath, "utf-8");
  return parseDashboardConfig(JSON.parse(raw));
}

export function resolveExplorerApi(config: DashboardConfig, network: NetworkKey): string {
  const explorerKey = config.networks[network].defaultExplorer;
  const explorer = config.networks[network].explorers[explorerKey];
  if (!explorer) {
    throw new Error(`defaultExplorer "${explorerKey}" missing in explorers (${network})`);
  }
  return explorer.apiUrl;
}

export function sanitizeError(err: unknown): string {
  if (err instanceof Error && err.name === "AbortError") {
    return "timeout";
  }

  const message = err instanceof Error ? err.message : String(err);
  const httpMatch = message.match(/HTTP\s+(\d{3})/i);
  if (httpMatch) {
    if (httpMatch[1] === "405") {
      return "HTTP 405 (check /rpc endpoint)";
    }
    if (httpMatch[1] === "404") {
      return "HTTP 404";
    }
    return `HTTP ${httpMatch[1]}`;
  }
  if (/timeout/i.test(message)) {
    return "timeout";
  }
  if (/fetch failed|network error|ECONNREFUSED|ENOTFOUND/i.test(message)) {
    return "network error";
  }
  if (/not found/i.test(message)) {
    return "not found";
  }
  if (/unexpected response/i.test(message)) {
    return "unexpected response";
  }
  if (/Explorer response/i.test(message)) {
    return message;
  }
  return "request failed";
}
