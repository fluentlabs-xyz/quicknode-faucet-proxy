# QuickNode Faucet Distributor Backend

Backend service for secure integration with the QuickNode Faucet API as a **distributor**.

---

## Features

- Proxy for QuickNode faucet distributor endpoints (`claim`, `can-claim`, `code`, `ban wallet`)
- reCaptcha v3 verification (score >= 0.8 required)
- IP and visitorId anti-abuse forwarding
- Never exposes API keys to frontend or users

---

## Endpoints

- `POST /api/claim` — Drip tokens to a wallet
- `POST /api/can-claim` — Check if a wallet can currently claim
- `GET /api/claim/:transactionId` — Get claim transaction status
- `POST /api/codes` — Generate one-time claim codes (optional)
- `POST /api/wallets/ban` — Ban a wallet (optional)
- `GET /healthz` — Health check

---

## Setup

1. Install dependencies:

    ```bash
    bun install
    ```

2. Create a `.env` file:

    ```
    DISTRIBUTOR_API_KEY=your_distributor_key
    RECAPTCHA_SECRET=your_recaptcha_secret
    ALLOWED_ORIGINS=http://localhost:5173
    PORT=8080
    ```

3. Run the backend:

    ```bash
    bun run index.ts
    ```

---

## Usage Notes

- All requests to QuickNode Faucet API are done **server-side only**.
- reCaptcha v3 is required for all `/claim` and `/can-claim` requests (score >= 0.8).
- Do **not** expose any API keys in frontend code.
- IP and visitorId should be sent from the client app to backend for anti-abuse.
- You may implement rate limiting or monitoring on the backend.

---

## Documentation

See the [Partner Faucet API Documentation (Google Doc)](https://docs.google.com/document/d/1K5TbGKPmH0Cb5DNsf_uwY85K3gOw0310SxECDHgnB_c/edit?tab=t.0) for full details.

---

**This backend is intended for distributors only — do not use the partner API key here!**
