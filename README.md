# QuickNode Faucet Distributor Backend

Backend proxy and minimal admin dashboard for managing and monitoring QuickNode faucet distributors.

---

## Structure

- `index.ts` — Express backend (proxy for QuickNode Partner API, safe key storage)
- `partnet-admin/` — Minimal frontend (dashboard for distributors and global rules)

---

## Features

- **Distributors list:** View all faucet distributors (name, uuid)
- **Distributor rules:** View rules for each distributor (on demand)
- **Global rules:** View current global rules for your faucet partner account

---

## Usage

1. **Install backend dependencies**  

    ```bash
    bun install
    ```

2. **Configure .env** (API keys, allowed origins, etc.)
3. **Run backend**

    ```bash
    bun run index.ts
    ```

4. **Frontend (partnet-admin):**

    ```bash
    cd partnet-admin
    npm install
    npm run dev
    ```

    Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Documentation

- **Full API details:**  
  [Partner Faucet API Documentation (Google Doc)](https://docs.google.com/document/d/1K5TbGKPmH0Cb5DNsf_uwY85K3gOw0310SxECDHgnB_c/edit?tab=t.0)

---

> This project is focused on **monitoring and support for faucet distributors**.  
> No edit/create/delete actions — for data visibility and quick troubleshooting.
