# Phantasma Network Dashboard (React)

Single-screen dashboard for BP and RPC health checks across mainnet/testnet/devnet.

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
      "hosts": {},
      "rpcs": {}
    },
    "devnet": {
      "hosts": {},
      "rpcs": {}
    }
  }
}
```

Notes:
- BP URLs must already include `/node/<name>/` and a trailing slash.
- RPC URLs must point to the JSON-RPC endpoint (usually `/rpc`).
- `role` is optional for hosts. If omitted, it defaults to `Watcher`.

## Docker (local)

```bash
docker compose up --build -d
```

The default compose exposes the dashboard on port `3003` and mounts `./config/hosts.json` into the container at `/app/config/hosts.json`.

## Explorer supply sources

The UI fetches SOUL/KCAL supply from explorer APIs:
- mainnet: `https://api-explorer.phantasma.info/api/v1`
- testnet: `https://api-testnet-explorer.phantasma.info/api/v1`
- devnet: `https://api-devnet-explorer.phantasma.info/api/v1`
