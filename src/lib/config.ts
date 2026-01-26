import { isRecord, readString } from "@/lib/validators";

export type NetworkKey = "mainnet" | "testnet" | "devnet";

export type HostEntry = {
  title: string;
  url: string;
  role: string;
};

export type RpcEntry = {
  title: string;
  url: string;
};

export type ExplorerEntry = {
  title?: string;
  url: string;
  apiUrl: string;
};

export type NetworkConfig = {
  defaultExplorer: string;
  hosts: Record<string, HostEntry>;
  rpcs: Record<string, RpcEntry>;
  explorers: Record<string, ExplorerEntry>;
};

export type DashboardConfig = {
  defaultNetwork: NetworkKey;
  networks: Record<NetworkKey, NetworkConfig>;
};

export const NETWORKS: NetworkKey[] = ["mainnet", "testnet", "devnet"];

type ParsedEntry = { title: string; url: string; role?: string };

function parseEntries(
  value: unknown,
  label: string,
  includeRole: boolean
): Record<string, ParsedEntry> {
  // Config is user-provided; validate strictly so we fail fast on malformed entries.
  if (value === undefined || value === null) {
    return {};
  }
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }

  const result: Record<string, ParsedEntry> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isRecord(entry)) {
      throw new Error(`${label} entry "${key}" must be an object`);
    }
    const title = readString(entry.title);
    const url = readString(entry.url);
    if (!title || !url) {
      throw new Error(`${label} entry "${key}" must include title and url`);
    }
    const role = includeRole ? readString(entry.role) ?? "Watcher" : undefined;

    result[key] = includeRole ? { title, url, role } : { title, url };
  }
  return result;
}

function parseNetworkConfig(value: unknown, label: NetworkKey): NetworkConfig {
  if (!isRecord(value)) {
    throw new Error(`network "${label}" must be an object`);
  }

  const hosts = parseEntries(value.hosts, `hosts (${label})`, true) as Record<
    string,
    HostEntry
  >;
  const rpcs = parseEntries(value.rpcs, `rpcs (${label})`, false) as Record<
    string,
    RpcEntry
  >;
  const explorers = parseExplorerEntries(value.explorers, `explorers (${label})`);
  // Each network declares its own default explorer to avoid cross-network API mixups.
  const defaultExplorer = readString(value.defaultExplorer);
  if (!defaultExplorer) {
    throw new Error(`network "${label}" must include defaultExplorer`);
  }
  if (!explorers[defaultExplorer]) {
    throw new Error(`defaultExplorer "${defaultExplorer}" missing in explorers (${label})`);
  }

  return {
    defaultExplorer,
    hosts,
    rpcs,
    explorers,
  };
}

function parseExplorerEntries(
  value: unknown,
  label: string
): Record<string, ExplorerEntry> {
  if (value === undefined || value === null) {
    return {};
  }
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }

  const result: Record<string, ExplorerEntry> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isRecord(entry)) {
      throw new Error(`${label} entry "${key}" must be an object`);
    }
    const url = readString(entry.url);
    const apiUrl = readString(entry.apiUrl);
    if (!url || !apiUrl) {
      throw new Error(`${label} entry "${key}" must include url and apiUrl`);
    }
    const title = readString(entry.title);
    result[key] = title ? { title, url, apiUrl } : { url, apiUrl };
  }
  return result;
}

export function parseDashboardConfig(payload: unknown): DashboardConfig {
  if (!isRecord(payload)) {
    throw new Error("Config must be an object");
  }

  const networksRaw = payload.networks;
  if (!isRecord(networksRaw)) {
    throw new Error("Config must include a networks object");
  }

  const networks = {
    mainnet: parseNetworkConfig(networksRaw.mainnet, "mainnet"),
    testnet: parseNetworkConfig(networksRaw.testnet, "testnet"),
    devnet: parseNetworkConfig(networksRaw.devnet, "devnet"),
  } satisfies Record<NetworkKey, NetworkConfig>;

  const defaultNetwork = NETWORKS.includes(payload.defaultNetwork as NetworkKey)
    ? (payload.defaultNetwork as NetworkKey)
    : "mainnet";

  return { defaultNetwork, networks };
}

export async function loadDashboardConfig(configUrl = "/hosts.json"): Promise<DashboardConfig> {
  const response = await fetch(configUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load config (${response.status})`);
  }

  // Do not guess missing fields; enforce the expected structure.
  const payload: unknown = await response.json();
  return parseDashboardConfig(payload);
}
