# Phantasma Network Dashboard (React)

Single-screen dashboard for BP, RPC, and explorer health checks across mainnet/testnet/devnet.

## Quick start (local dev)

```bash
npm install
npm run dev
```

## Config (server-only)

The dashboard reads a server-side JSON file. The default Docker setup mounts it at
`/app/config/hosts.json` and sets `DASHBOARD_CONFIG_PATH` accordingly.

```json
{
  "defaultNetwork": "mainnet",
  "networks": {
    "mainnet": {
      "defaultExplorer": "phantasma",
      "explorers": {
        "phantasma": {
          "url": "https://explorer.phantasma.info",
          "apiUrl": "https://api-explorer.phantasma.info/api/v1"
        }
      },
      "hosts": {
        "main-a": {
          "title": "Mainnet BP A",
          "url": "https://example.org/node/a/",
          "role": "Watcher"
        }
      },
      "rpcs": {
        "rpc-1": {
          "title": "Mainnet RPC 1",
          "url": "https://example.org/rpc"
        }
      }
    },
    "testnet": {
      "defaultExplorer": "phantasma",
      "explorers": {
        "phantasma": {
          "url": "https://testnet-explorer.phantasma.info",
          "apiUrl": "https://api-testnet-explorer.phantasma.info/api/v1"
        }
      },
      "hosts": {},
      "rpcs": {}
    },
    "devnet": {
      "defaultExplorer": "phantasma",
      "explorers": {
        "phantasma": {
          "url": "https://devnet-explorer.phantasma.info",
          "apiUrl": "https://api-devnet-explorer.phantasma.info/api/v1"
        }
      },
      "hosts": {},
      "rpcs": {}
    }
  }
}
```

Notes:
- BP URLs must already include `/node/<name>/` and a trailing slash.
- RPC URLs must point to the JSON-RPC endpoint (usually `/rpc`).
- RPC cards surface a Swagger link by removing the trailing `/rpc`.
- Explorer cards surface links to both the explorer front-end and the explorer API (using `apiUrl` without `/api/v1`).
- Each network must include `defaultExplorer` matching one of its explorer keys.
- `role` is optional for hosts. If omitted, it defaults to `Watcher`.

## Docker (local)

```bash
docker compose up --build -d
```

The default compose exposes the dashboard on port `3003` and mounts `./config/hosts.json` into the container at `/app/config/hosts.json`.

## Explorer supply sources

SOUL/KCAL supply is fetched from the `apiUrl` of the per-network `defaultExplorer` entry.
