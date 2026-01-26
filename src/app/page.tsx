"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StatusCard } from "@/components/StatusCard";
import { NETWORKS, type NetworkKey } from "@/lib/config";
import { formatNumberString, formatNumberStringWhole } from "@/lib/metrics";
import type { CardData } from "@/lib/types";
import { ChevronDown, ChevronUp } from "lucide-react";

const networkLabels: Record<NetworkKey, string> = {
  mainnet: "Mainnet",
  testnet: "Testnet",
  devnet: "Devnet",
};

type DashboardResponse = {
  network: NetworkKey;
  defaultNetwork: NetworkKey;
  counts: { hosts: number; rpcs: number; explorers: number };
  cards: CardData[];
  maxHeight: number | null;
  supply?: { soul: string | null; kcal: string | null; error?: string };
};

type SupplyResponse = {
  network: NetworkKey;
  defaultNetwork: NetworkKey;
  supply: { soul: string | null; kcal: string | null; error?: string };
};

type SupplyState = {
  soul: string | null;
  kcal: string | null;
  error?: string;
};

type DashboardState = {
  cards: CardData[];
  counts: { hosts: number; rpcs: number; explorers: number };
  maxHeight: number | null;
};

const emptyState: DashboardState = {
  cards: [],
  counts: { hosts: 0, rpcs: 0, explorers: 0 },
  maxHeight: null,
};

const emptySupply: SupplyState = {
  soul: null,
  kcal: null,
};

const storageKey = "pha-dashboard-network";
const summaryStorageKey = "pha-dashboard-summary-collapsed";

function normalizeNetwork(value: string | null): NetworkKey {
  if (value && NETWORKS.includes(value as NetworkKey)) {
    return value as NetworkKey;
  }
  return "mainnet";
}

function readPreferredNetwork(): NetworkKey | null {
  if (typeof window === "undefined") {
    return null;
  }
  const url = new URL(window.location.href);
  const queryNetwork = url.searchParams.get("network");
  if (queryNetwork && NETWORKS.includes(queryNetwork as NetworkKey)) {
    return queryNetwork as NetworkKey;
  }
  const stored = window.localStorage.getItem(storageKey);
  if (stored && NETWORKS.includes(stored as NetworkKey)) {
    return stored as NetworkKey;
  }
  return null;
}

async function requestDashboard(
  network: NetworkKey | null,
  lite: boolean
): Promise<DashboardResponse> {
  const params = new URLSearchParams();
  if (network) {
    params.set("network", network);
  }
  if (lite) {
    params.set("lite", "1");
  }
  const url = params.toString() ? `/api/dashboard?${params.toString()}` : "/api/dashboard";
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as DashboardResponse;
}

async function requestSupply(network: NetworkKey): Promise<SupplyResponse> {
  const response = await fetch(`/api/supply?network=${network}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as SupplyResponse;
}

function toDashboardState(data: DashboardResponse): DashboardState {
  return {
    cards: data.cards ?? [],
    counts: data.counts ?? { hosts: 0, rpcs: 0, explorers: 0 },
    maxHeight: typeof data.maxHeight === "number" ? data.maxHeight : null,
  };
}
export default function Home() {
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkKey>(() => {
    if (typeof window === "undefined") {
      return "mainnet";
    }
    return readPreferredNetwork() ?? "mainnet";
  });
  const [dashboard, setDashboard] = useState<DashboardState>(emptyState);
  const [supply, setSupply] = useState<SupplyState>(emptySupply);
  const [cardsStatus, setCardsStatus] = useState<"idle" | "loading" | "refreshing">(
    "loading"
  );
  const [supplyStatus, setSupplyStatus] = useState<"idle" | "loading" | "refreshing">(
    "loading"
  );
  const [error, setError] = useState<string | null>(null);
  const [hasResolvedPreference, setHasResolvedPreference] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return readPreferredNetwork() !== null;
  });
  const [refreshingCards, setRefreshingCards] = useState<Record<string, boolean>>({});
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);

  const skipNextFetch = useRef(false);
  const hasInitialLoad = useRef(false);
  const dashboardCache = useRef<Record<NetworkKey, DashboardState | null>>({
    mainnet: null,
    testnet: null,
    devnet: null,
  });
  const supplyCache = useRef<Record<NetworkKey, SupplyState | null>>({
    mainnet: null,
    testnet: null,
    devnet: null,
  });
  const dashboardRequestId = useRef(0);
  const supplyRequestId = useRef(0);
  const nodeRequestId = useRef(0);
  const pendingNodeLoads = useRef(0);

  useEffect(() => {
    if (!hasResolvedPreference || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(storageKey, selectedNetwork);
    const url = new URL(window.location.href);
    url.searchParams.set("network", selectedNetwork);
    window.history.replaceState(null, "", url.toString());
  }, [hasResolvedPreference, selectedNetwork]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.localStorage.getItem(summaryStorageKey);
    if (stored) {
      setSummaryCollapsed(stored === "1");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(summaryStorageKey, summaryCollapsed ? "1" : "0");
  }, [summaryCollapsed]);

  useEffect(() => {
    let cancelled = false;
    setCardsStatus("loading");
    setSupplyStatus("loading");
    setError(null);
    setRefreshingCards({});

    const loadInitial = async () => {
      const currentDashboardRequest = ++dashboardRequestId.current;
      const currentSupplyRequest = ++supplyRequestId.current;
      const preferredNetwork = readPreferredNetwork();
      const initialNetwork = preferredNetwork ?? selectedNetwork;

      if (preferredNetwork && preferredNetwork !== selectedNetwork) {
        skipNextFetch.current = true;
        setSelectedNetwork(preferredNetwork);
      }
      setHasResolvedPreference(true);

      const startSupplyFetch = (network: NetworkKey, requestId: number) => {
        // Fetch supply independently so it can render before slow BP/RPC queries.
        void (async () => {
          try {
            const supplyResult = await requestSupply(network);
            if (!cancelled && supplyRequestId.current === requestId) {
              const nextSupply = supplyResult.supply ?? emptySupply;
              setSupply(nextSupply);
              supplyCache.current[network] = nextSupply;
            }
          } catch (err) {
            if (!cancelled && supplyRequestId.current === requestId) {
              const message = err instanceof Error ? err.message : String(err);
              const nextSupply = { soul: null, kcal: null, error: message };
              setSupply(nextSupply);
              supplyCache.current[network] = nextSupply;
            }
          } finally {
            if (!cancelled && supplyRequestId.current === requestId) {
              setSupplyStatus("idle");
            }
          }
        })();
      };

      startSupplyFetch(initialNetwork, currentSupplyRequest);
      try {
        const liteData = await requestDashboard(preferredNetwork, true);
        if (cancelled || dashboardRequestId.current !== currentDashboardRequest) return;

        const liteState = toDashboardState(liteData);
        setDashboard(liteState);

        const nextNetwork =
          preferredNetwork ??
          normalizeNetwork(liteData.network ?? liteData.defaultNetwork ?? selectedNetwork);
        dashboardCache.current[nextNetwork] = liteState;

        if (nextNetwork !== selectedNetwork) {
          skipNextFetch.current = true;
          setSelectedNetwork(nextNetwork);
        }

        const currentNodeRequest = ++nodeRequestId.current;
        startNodeLoads(liteState.cards, nextNetwork, currentNodeRequest);

        if (nextNetwork !== initialNetwork) {
          const nextSupplyRequest = ++supplyRequestId.current;
          setSupplyStatus("refreshing");
          startSupplyFetch(nextNetwork, nextSupplyRequest);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setCardsStatus("idle");
        }
      } finally {
        if (!cancelled) {
          setHasResolvedPreference(true);
          hasInitialLoad.current = true;
        }
      }
    };

    loadInitial();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasInitialLoad.current) {
      return;
    }
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }

    let cancelled = false;
    const cachedDashboard = dashboardCache.current[selectedNetwork];
    const cachedSupply = supplyCache.current[selectedNetwork];

    if (cachedDashboard) {
      setDashboard(cachedDashboard);
      setCardsStatus("refreshing");
    } else {
      setCardsStatus("loading");
    }

    if (cachedSupply) {
      setSupply(cachedSupply);
      setSupplyStatus("refreshing");
    } else {
      setSupply(emptySupply);
      setSupplyStatus("loading");
    }

    setError(null);
    setRefreshingCards({});

    const loadNetwork = async () => {
      const currentDashboardRequest = ++dashboardRequestId.current;
      const currentSupplyRequest = ++supplyRequestId.current;
      const currentNodeRequest = ++nodeRequestId.current;
      if (!cachedDashboard) {
        try {
          const liteData = await requestDashboard(selectedNetwork, true);
          if (!cancelled && dashboardRequestId.current === currentDashboardRequest) {
            const liteState = toDashboardState(liteData);
            setDashboard(liteState);
            dashboardCache.current[selectedNetwork] = liteState;
            startNodeLoads(liteState.cards, selectedNetwork, currentNodeRequest);
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : String(err));
            setCardsStatus("idle");
          }
        }
      } else if (!cancelled && dashboardRequestId.current === currentDashboardRequest) {
        startNodeLoads(cachedDashboard.cards, selectedNetwork, currentNodeRequest);
      }

      void (async () => {
        try {
          const supplyResult = await requestSupply(selectedNetwork);
          if (!cancelled && supplyRequestId.current === currentSupplyRequest) {
            const nextSupply = supplyResult.supply ?? emptySupply;
            setSupply(nextSupply);
            supplyCache.current[selectedNetwork] = nextSupply;
          }
        } catch (err) {
          if (!cancelled && supplyRequestId.current === currentSupplyRequest) {
            const message = err instanceof Error ? err.message : String(err);
            const nextSupply = { soul: null, kcal: null, error: message };
            setSupply(nextSupply);
            supplyCache.current[selectedNetwork] = nextSupply;
          }
        } finally {
          if (!cancelled && supplyRequestId.current === currentSupplyRequest) {
            setSupplyStatus("idle");
          }
        }
      })();
    };

    loadNetwork();

    return () => {
      cancelled = true;
    };
  }, [selectedNetwork]);

  const supplyLabel = useMemo(() => {
    return {
      soul: formatNumberString(supply.soul),
      kcal: formatNumberString(supply.kcal),
    };
  }, [supply]);

  const supplyCompact = useMemo(() => {
    return {
      soul: formatNumberStringWhole(supply.soul),
      kcal: formatNumberStringWhole(supply.kcal),
    };
  }, [supply]);

  const statusLabel = useMemo(() => {
    if (cardsStatus === "loading" || supplyStatus === "loading") {
      return "Loading";
    }
    if (cardsStatus === "refreshing" || supplyStatus === "refreshing") {
      return "Refreshing";
    }
    return "Ready";
  }, [cardsStatus, supplyStatus]);

  const placeholderCount = Math.max(
    6,
    dashboard.counts.hosts + dashboard.counts.rpcs + dashboard.counts.explorers,
    dashboard.cards.length || 0
  );

  const updateDashboardState = (
    network: NetworkKey,
    updater: (previous: DashboardState) => DashboardState
  ) => {
    setDashboard((previous) => {
      const next = updater(previous);
      dashboardCache.current[network] = next;
      return next;
    });
  };

  const mergeCardUpdate = (
    previous: DashboardState,
    cardId: string,
    nextCard: CardData,
    options?: { ignoreNulls?: boolean }
  ): DashboardState => {
    const cards = previous.cards.map((item) => {
      if (item.id !== cardId) {
        return item;
      }
      const merged = {
        ...item,
        ...nextCard,
      } as Record<string, unknown>;
      if (options?.ignoreNulls) {
        for (const [key, value] of Object.entries(nextCard)) {
          if (value === null || value === undefined) {
            merged[key] = (item as Record<string, unknown>)[key];
          }
        }
      }
      return {
        ...(merged as CardData),
        // Preserve stable IDs and kinds from the shell list.
        id: item.id,
        kind: item.kind,
        nodeKey: item.nodeKey ?? nextCard.nodeKey,
      };
    });
    const heights = cards
      .filter((item) => item.kind !== "explorer")
      .map((item) => item.height)
      .filter((height): height is number => height !== null);
    const maxHeight = heights.length ? Math.max(...heights) : null;
    return { ...previous, cards, maxHeight };
  };

  const applyCardError = (
    previous: DashboardState,
    cardId: string,
    message: string
  ): DashboardState => ({
    ...previous,
    cards: previous.cards.map((item) =>
      item.id === cardId ? { ...item, error: message } : item
    ),
  });

  const requestNodeCard = async (
    network: NetworkKey,
    card: CardData,
    options?: { latency?: boolean; part?: string }
  ) => {
    if (!card.nodeKey) {
      throw new Error("Missing node key");
    }
    const params = new URLSearchParams({
      network,
      kind: card.kind,
      key: card.nodeKey,
    });
    if (options?.part) {
      params.set("part", options.part);
    } else if (options?.latency) {
      params.set("latency", "1");
    }
    const response = await fetch(`/api/node?${params.toString()}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = (await response.json()) as { card: CardData };
    return payload.card;
  };

  const startNodeLoads = (cards: CardData[], network: NetworkKey, requestId: number) => {
    const targets = cards.filter((card) => card.nodeKey);
    pendingNodeLoads.current = targets.length;
    if (pendingNodeLoads.current === 0) {
      setCardsStatus("idle");
      return;
    }
    setCardsStatus("refreshing");

    const finishPrimary = () => {
      if (nodeRequestId.current !== requestId) {
        return;
      }
      pendingNodeLoads.current = Math.max(0, pendingNodeLoads.current - 1);
      if (pendingNodeLoads.current === 0) {
        setCardsStatus("idle");
      }
    };

    const requestAndApply = (card: CardData, options: {
      part?: string;
      ignoreNulls?: boolean;
      suppressError?: boolean;
      onFinally?: () => void;
    }) => {
      void (async () => {
        try {
          const nextCard = await requestNodeCard(network, card, { part: options.part });
          if (nodeRequestId.current !== requestId) {
            return;
          }
          updateDashboardState(network, (previous) =>
            mergeCardUpdate(previous, card.id, nextCard, { ignoreNulls: options.ignoreNulls })
          );
        } catch (err) {
          if (nodeRequestId.current !== requestId) {
            return;
          }
          if (!options.suppressError) {
            const message = err instanceof Error ? err.message : String(err);
            updateDashboardState(network, (previous) =>
              applyCardError(previous, card.id, message)
            );
          }
        } finally {
          options.onFinally?.();
        }
      })();
    };

    const primaryJobs: Array<{
      card: CardData;
      part?: string;
      ignoreNulls?: boolean;
      suppressError?: boolean;
      onFinally?: () => void;
    }> = [];
    const secondaryJobs: Array<{
      card: CardData;
      part?: string;
      ignoreNulls?: boolean;
      suppressError?: boolean;
    }> = [];

    for (const card of targets) {
      if (card.kind === "bp") {
        primaryJobs.push({ card, part: "heights", onFinally: finishPrimary });
        secondaryJobs.push({ card, part: "status", ignoreNulls: true });
        continue;
      }
      if (card.kind === "rpc") {
        primaryJobs.push({ card, part: "height", onFinally: finishPrimary });
        secondaryJobs.push({ card, part: "version", ignoreNulls: true });
        secondaryJobs.push({ card, part: "latency", ignoreNulls: true, suppressError: true });
        continue;
      }
      primaryJobs.push({ card, onFinally: finishPrimary });
    }

    const priorityForKind = (kind: CardData["kind"]) => {
      if (kind === "rpc") return 0;
      if (kind === "explorer") return 1;
      return 2;
    };

    primaryJobs
      .sort((a, b) => priorityForKind(a.card.kind) - priorityForKind(b.card.kind))
      .forEach((job) => {
        requestAndApply(job.card, {
          part: job.part,
          ignoreNulls: job.ignoreNulls,
          suppressError: job.suppressError,
          onFinally: job.onFinally,
        });
      });

    if (secondaryJobs.length > 0) {
      setTimeout(() => {
        for (const job of secondaryJobs) {
          requestAndApply(job.card, {
            part: job.part,
            ignoreNulls: job.ignoreNulls,
            suppressError: job.suppressError,
          });
        }
      }, 0);
    }
  };

  const refreshCard = async (card: CardData) => {
    if (!card.nodeKey) {
      return;
    }
    const currentNodeRequest = nodeRequestId.current;
    setRefreshingCards((prev) => ({ ...prev, [card.id]: true }));

    const applyUpdate = (nextCard: CardData, ignoreNulls?: boolean) => {
      updateDashboardState(selectedNetwork, (previous) =>
        mergeCardUpdate(previous, card.id, nextCard, { ignoreNulls })
      );
    };

    const applyError = (err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      updateDashboardState(selectedNetwork, (previous) =>
        applyCardError(previous, card.id, message)
      );
    };

    const runPart = async (part?: string, options?: { ignoreNulls?: boolean; suppressError?: boolean }) => {
      const nextCard = await requestNodeCard(selectedNetwork, card, { part });
      if (nodeRequestId.current !== currentNodeRequest) {
        return;
      }
      applyUpdate(nextCard, options?.ignoreNulls);
    };

    try {
      if (card.kind === "bp") {
        await runPart("heights");
        void (async () => {
          try {
            await runPart("status", { ignoreNulls: true });
          } catch (err) {
            if (nodeRequestId.current !== currentNodeRequest) return;
            applyError(err);
          }
        })();
      } else if (card.kind === "rpc") {
        await runPart("height");
        void (async () => {
          try {
            await runPart("version", { ignoreNulls: true });
          } catch (err) {
            if (nodeRequestId.current !== currentNodeRequest) return;
            applyError(err);
          }
        })();
        void (async () => {
          try {
            await runPart("latency", { ignoreNulls: true, suppressError: true });
          } catch {
            // ignore latency errors on refresh
          }
        })();
      } else {
        await runPart();
      }
    } catch (err) {
      if (nodeRequestId.current !== currentNodeRequest) {
        return;
      }
      applyError(err);
    } finally {
      setRefreshingCards((prev) => ({ ...prev, [card.id]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-rose-100/40 via-background to-background dark:from-rose-900/30">
      <div className="mx-auto flex w-full flex-col gap-8 px-6 py-10">
        <header className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
              Phantasma Network
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">Status Dashboard</h1>
              <button
                type="button"
                onClick={() => setSummaryCollapsed((prev) => !prev)}
                className="rounded-md border border-border bg-card p-1.5 text-muted-foreground hover:text-foreground"
                aria-label={summaryCollapsed ? "Expand summary" : "Collapse summary"}
              >
                {summaryCollapsed ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronUp className="h-3.5 w-3.5" />
                )}
              </button>
              {summaryCollapsed ? (
                <span className="text-xs font-mono text-foreground">
                  SOUL {supplyCompact.soul} · KCAL {supplyCompact.kcal}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-full border border-border bg-card p-1 text-sm">
              {NETWORKS.map((network) => (
                <button
                  key={network}
                  type="button"
                  onClick={() => setSelectedNetwork(network)}
                  className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                    hasResolvedPreference && selectedNetwork === network
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {networkLabels[network]}
                </button>
              ))}
            </div>
            <ThemeToggle />
          </div>
        </header>

        {!summaryCollapsed ? (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Total supply
              </div>
              <div className="mt-3 grid gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">SOUL</span>
                  <span className="font-mono text-foreground">{supplyLabel.soul}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">KCAL</span>
                  <span className="font-mono text-foreground">{supplyLabel.kcal}</span>
                </div>
                {supply.error ? (
                  <div className="text-xs text-destructive">{supply.error}</div>
                ) : null}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Summary
              </div>
              <div className="mt-3 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Max height</span>
                  <span className="font-mono text-foreground">
                    {dashboard.maxHeight === null
                      ? "—"
                      : dashboard.maxHeight.toLocaleString("en-US")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Total nodes</span>
                  <span className="font-mono text-foreground">
                    {dashboard.counts.hosts + dashboard.counts.rpcs}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Status</span>
                  <span className="font-mono text-foreground">{statusLabel}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card/80 p-5 shadow-sm backdrop-blur">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Config
              </div>
              <div className="mt-3 text-sm text-muted-foreground">
                <div>Network: {networkLabels[selectedNetwork]}</div>
                <div>Hosts: {dashboard.counts.hosts}</div>
                <div>RPCs: {dashboard.counts.rpcs}</div>
                <div>Explorers: {dashboard.counts.explorers}</div>
              </div>
            </div>
          </section>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        <section
          className="grid min-h-[calc(100vh-24rem)] gap-6"
          style={{
            gridAutoRows: "1fr",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          }}
        >
          {dashboard.cards.map((card) => (
            <StatusCard
              key={card.id}
              card={card}
              maxHeight={dashboard.maxHeight}
              onRefresh={() => refreshCard(card)}
              refreshing={Boolean(refreshingCards[card.id])}
            />
          ))}
          {cardsStatus === "loading" && dashboard.cards.length === 0
            ? Array.from({ length: placeholderCount }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card/70 p-5 shadow-sm animate-pulse"
                >
                  <div className="h-3 w-24 rounded bg-muted" />
                  <div className="h-6 w-40 rounded bg-muted" />
                  <div className="h-24 rounded bg-muted" />
                  <div className="mt-auto h-3 w-28 rounded bg-muted" />
                </div>
              ))
            : null}
          {cardsStatus !== "loading" && dashboard.counts.hosts + dashboard.counts.rpcs + dashboard.counts.explorers === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
              No nodes configured for {networkLabels[selectedNetwork]}. Update the server config file.
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
