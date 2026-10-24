# LifeTag

Offline NFC emergency ID. Customers order on the site, staff prepare the tag, and a responder taps it to read plain text with no app or signal.

## Run

```bash
cp .env.example .env      # set database, staff secrets, and GCash/Maya values
npm install
npm run staff:hash-password # generate a staff password hash and session secret
npm run dev               # http://localhost:8080 (embedded PGLite database)
npm test                  # payload format test
```

The allowed staff usernames are `Duane`, `Kenneth`, `Lance`, and `Rosemande`. All four currently use the same password, verified on the server against `STAFF_PASSWORD_HASH`. Run `npm run staff:hash-password` in a terminal to create a scrypt hash and a session secret; password input is hidden. Keep those values in the server's `.env` locally and the production host's secret settings. Staff members only need their username and password to sign in; do not give them the `.env` file or commit it.

Production: set `DATABASE_URL`, `STAFF_PASSWORD_HASH`, `STAFF_SESSION_SECRET`, `GCASH_NUMBER`, and `GCASH_NAME` on the host. `STAFF_SESSION_SECRET` must be at least 32 bytes; the password generator creates a fresh 32-byte secret. After changing the login configuration, restart/redeploy the application. `npm run build` applies `migrations/` automatically.
`src/routeTree.gen.ts` is generated on first `dev` or `build`.

## How the data reaches the tag

1. Customers use `/order` to submit the form. `POST /api/orders` stores the order as `awaiting_payment` and returns its id and private receipt code.
2. Checkout shows the product amount and GCash/Maya account from `GCASH_NUMBER` and `GCASH_NAME`. The customer submits a payment reference; staff verify it and click **Mark paid** before production can start. No payment gateway is connected.
3. Customers can check progress at `/track` with their order id and private receipt. Staff open `/staff`, sign in with their configured username and password, and work the order through payload, production, quality checks, and dispatch. The server keeps staff sessions in an HttpOnly, SameSite=Strict cookie that expires after eight hours.

If the order API is unavailable, checkout keeps a browser-only copy labeled **not saved on the server**. Staff cannot see or fulfill it; the customer must submit again when the service is available.

## API

| Method and path | Who | Purpose |
|---|---|---|
| `POST /api/orders` | public, rate limited | Create an `awaiting_payment` order. Returns only `{ id, receipt }`; keep the private receipt for `/track`. |
| `POST /api/orders/:id/payment-reference` | public, rate limited | Submit a payment reference using the private receipt. The order remains unpaid until staff verifies it. |
| `GET /api/payment-instructions` | public | Returns the configured GCash/Maya account name and number. |
| `GET /api/orders/lookup?id=…&receipt=…` | public, rate limited | Look up order progress using the private receipt. Returns only product, status, tracking note, and progress booleans. |
| `POST /api/auth/login`, `POST /api/auth/logout` | Public login / active session | Start or clear the eight-hour staff session. Login attempts are rate limited. |
| `GET /api/orders`, `GET/PATCH /api/orders/:id` | Staff session | Desk list, read, update steps, paid status, tracking. |

Staff credentials and session signing secrets are server-only; browser requests use the session cookie and never receive the password hash or signing secret.

## Notes

- Customer pages are `/`, `/order`, `/scan`, `/support`, and `/track`. The staff desk is isolated at `/staff`.
- The payload format lives in `src/lib/payload.ts` and is imported by the site client; `npm test` guards it.
- Payload limit is 120 bytes, leaving room for NDEF framing on a 144-byte NTAG213.
- Orders remain `awaiting_payment` until staff marks them paid after reviewing the submitted reference. No payment gateway is connected.
- Design reference images are in `docs/`.
