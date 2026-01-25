import { describe, expect, it } from "vitest";
import { parseDashboardConfig } from "@/lib/config";

const baseConfig = {
  defaultNetwork: "mainnet",
  networks: {
    mainnet: {
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
      defaultHost: "",
      hosts: {},
      defaultRpc: "",
      rpcs: {},
    },
    devnet: {
      defaultHost: "",
      hosts: {},
      defaultRpc: "",
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
          hosts: {
            "main-b": { title: "Mainnet B", url: "https://example.com/node/b/" },
          },
          rpcs: {},
        },
        testnet: {},
        devnet: {},
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
            hosts: {
              bad: { title: "Missing url" },
            },
          },
          testnet: {},
          devnet: {},
        },
      })
    ).toThrowError(/hosts/);
  });
});
