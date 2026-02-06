# QuickNode Faucet Distributor Backend

Proxy backend for QuickNode Faucet API with JWT validation (Para/Privy) and rate limiting.

## Quick Start

```bash
cp config/config.example.json config/config.json
cp .env.example .env
docker-compose up -d
```

## API Request Formats

### Direct Mode

```bash
curl -X POST http://localhost:8080/endpoint \
  -H "Content-Type: application/json" \
  -d '{"visitorId": "fp_xxx", "walletAddress": "0x..."}'
```

### Para Mode

```bash
curl -X POST http://localhost:8080/endpoint \
  -H "Authorization: Bearer <para-jwt>" \
  -d '{"visitorId": "fp_xxx"}'
```

### Privy Mode

```bash
curl -X POST http://localhost:8080/endpoint \
  -H "Authorization: Bearer <privy-identity-token>" \
  -d '{"visitorId": "fp_xxx"}'
```

## How to Add New Endpoint

1. **Create distributor**

```bash
   bun run script/create-distributor.ts "My Faucet"
   # save uuid and apiKey
```

1. **Set rules** (optional)

```bash
   bun run script/set-distributor-rules.ts <uuid>
```

1. **Add to config**

```json
   "/my/endpoint": {
     "distributorId": "<uuid>",
     "distributorApiKey": "${MY_API_KEY}",
     "dripAmount": 0.1,
     "validators": {
       "privy-account": {
         "jwksUrl": "https://auth.privy.io/api/v1/apps/${PRIVY_APP_ID}/jwks.json",
         "appId": "${PRIVY_APP_ID}"
       },
       "once-only": {}
     }
   }
```

1. **Add secret to .env**

2. **Restart and test**

```bash
   docker-compose restart backend
   bun run script/claim-privy.ts $TOKEN visitor123 /my/endpoint
```

## Validators

| Name | Config | Description |
|------|--------|-------------|
| `para-account` | `{jwksUrl, verifyUrl?, secretKey?}` | Para JWT |
| `privy-account` | `{jwksUrl, appId}` | Privy JWT |
| `direct` | `true` | No auth, wallet in body |
| `once-only` | `{}` | One claim per wallet |
| `time-limit` | `{period, maxClaims, cooldownHours}` | Rate limiting |
| `nft-ownership` | `{contractAddress, tokenId, rpcUrl}` | ERC1155 gate |

## Scripts

| Script | Usage |
|--------|-------|
| `claim.ts` | `<jwt> <visitorId>` — test Para |
| `claim-privy.ts` | `<jwt> <visitorId> [endpoint]` — test Privy |
| `claim-direct.ts` | `<wallet> <visitorId>` — test Direct |
| `create-distributor.ts` | `<name>` — create QuickNode distributor |
| `get-distributors.ts` | list all distributors |
| `set-distributor-rules.ts` | `<uuid>` — sync rules |
| `parse-jwt.ts` | `<token>` — decode JWT |

## Environment

```
DATABASE_URL=postgres://user:pass@host:5432/db
CONFIG_PATH=/app/config/config.json
PORT=8080
LOG_LEVEL=info
```
