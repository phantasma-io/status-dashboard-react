import { describe, expect, it } from "vitest";
import { parseDashboardConfig } from "@/lib/config";

const baseConfig = {
  defaultNetwork: "mainnet",
  networks: {
    mainnet: {
      defaultExplorer: "phantasma",
      explorers: {
        phantasma: {
          title: "Phantasma Explorer",
          url: "https://explorer.example.org",
          apiUrl: "https://api.example.org/api/v1",
        },
      },
      hosts: {
        "main-a": {
          title: "Mainnet A",
          url: "https://example.com/node/a/",
          role: "Validator",
        },
      },
      rpcs: {
        "rpc-a": { title: "RPC A", url: "https://example.com/rpc" },
      },
    },
    testnet: {
      defaultExplorer: "phantasma",
      explorers: {
        phantasma: {
          url: "https://testnet-explorer.example.org",
          apiUrl: "https://api-testnet.example.org/api/v1",
        },
      },
      hosts: {},
      rpcs: {},
    },
    devnet: {
      defaultExplorer: "phantasma",
      explorers: {
        phantasma: {
          url: "https://devnet-explorer.example.org",
          apiUrl: "https://api-devnet.example.org/api/v1",
        },
      },
      hosts: {},
      rpcs: {},
    },
  },
};

describe("parseDashboardConfig", () => {
  it("parses a valid config and preserves defaults", () => {
    // Ensure we keep explicit defaults and entries as provided by the user.
    const config = parseDashboardConfig(baseConfig);
    expect(config.defaultNetwork).toBe("mainnet");
    expect(config.networks.mainnet.hosts["main-a"].title).toBe("Mainnet A");
    expect(config.networks.mainnet.hosts["main-a"].role).toBe("Validator");
    expect(config.networks.mainnet.rpcs["rpc-a"].url).toBe("https://example.com/rpc");
  });

  it("defaults host role to Watcher when missing", () => {
    // Missing roles should default to Watcher to avoid empty labels.
    const config = parseDashboardConfig({
      defaultNetwork: "mainnet",
      networks: {
        mainnet: {
          defaultExplorer: "phantasma",
          explorers: {
            phantasma: {
              url: "https://explorer.example.org",
              apiUrl: "https://api.example.org/api/v1",
            },
          },
          hosts: {
            "main-b": { title: "Mainnet B", url: "https://example.com/node/b/" },
          },
          rpcs: {},
        },
        testnet: {
          defaultExplorer: "phantasma",
          explorers: {
            phantasma: {
              url: "https://testnet-explorer.example.org",
              apiUrl: "https://api-testnet.example.org/api/v1",
            },
          },
        },
        devnet: {
          defaultExplorer: "phantasma",
          explorers: {
            phantasma: {
              url: "https://devnet-explorer.example.org",
              apiUrl: "https://api-devnet.example.org/api/v1",
            },
          },
        },
      },
    });
    expect(config.networks.mainnet.hosts["main-b"].role).toBe("Watcher");
  });

  it("defaults to mainnet when defaultNetwork is invalid", () => {
    // Invalid network values should never crash the UI.
    const config = parseDashboardConfig({
      ...baseConfig,
      defaultNetwork: "unknown",
    });
    expect(config.defaultNetwork).toBe("mainnet");
  });

  it("rejects malformed host entries", () => {
    // Malformed entries should throw so operators notice config errors.
    expect(() =>
      parseDashboardConfig({
        defaultNetwork: "mainnet",
        networks: {
          mainnet: {
            defaultExplorer: "phantasma",
            explorers: {
              phantasma: {
                url: "https://explorer.example.org",
                apiUrl: "https://api.example.org/api/v1",
              },
            },
            hosts: {
              bad: { title: "Missing url" },
            },
          },
          testnet: {
            defaultExplorer: "phantasma",
            explorers: {
              phantasma: {
                url: "https://testnet-explorer.example.org",
                apiUrl: "https://api-testnet.example.org/api/v1",
              },
            },
          },
          devnet: {
            defaultExplorer: "phantasma",
            explorers: {
              phantasma: {
                url: "https://devnet-explorer.example.org",
                apiUrl: "https://api-devnet.example.org/api/v1",
              },
            },
          },
        },
      })
    ).toThrowError(/hosts/);
  });

  it("rejects malformed explorer entries", () => {
    expect(() =>
      parseDashboardConfig({
        defaultNetwork: "mainnet",
        networks: {
          mainnet: {
            defaultExplorer: "phantasma",
            explorers: {
              phantasma: {
                url: "https://explorer.example.org",
              },
            },
            hosts: {},
            rpcs: {},
          },
          testnet: {
            defaultExplorer: "phantasma",
            explorers: {
              phantasma: {
                url: "https://testnet-explorer.example.org",
                apiUrl: "https://api-testnet.example.org/api/v1",
              },
            },
          },
          devnet: {
            defaultExplorer: "phantasma",
            explorers: {
              phantasma: {
                url: "https://devnet-explorer.example.org",
                apiUrl: "https://api-devnet.example.org/api/v1",
              },
            },
          },
        },
      })
    ).toThrowError(/explorers/);
  });
  it("rejects missing defaultExplorer in a network", () => {
    // Each network must declare which explorer supplies API data for that environment.
    expect(() =>
      parseDashboardConfig({
        defaultNetwork: "mainnet",
        networks: {
          mainnet: {
            explorers: {
              phantasma: {
                url: "https://explorer.example.org",
                apiUrl: "https://api.example.org/api/v1",
              },
            },
            hosts: {},
            rpcs: {},
          },
          testnet: {
            defaultExplorer: "phantasma",
            explorers: {
              phantasma: {
                url: "https://testnet-explorer.example.org",
                apiUrl: "https://api-testnet.example.org/api/v1",
              },
            },
            hosts: {},
            rpcs: {},
          },
          devnet: {
            defaultExplorer: "phantasma",
            explorers: {
              phantasma: {
                url: "https://devnet-explorer.example.org",
                apiUrl: "https://api-devnet.example.org/api/v1",
              },
            },
            hosts: {},
            rpcs: {},
          },
        },
      })
    ).toThrowError(/defaultExplorer/);
  });

});
