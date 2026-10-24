# LifeTag

Offline NFC emergency ID. Customers order on the site, staff prepare and encode the tag, and a responder taps it to read plain text with no app or signal.

## Run

```bash
cp .env.example .env      # set staff, encoder, and GCash/Maya account values
npm install
npm run dev               # http://localhost:8080 (embedded PGLite database)
npm test                  # payload format test
python3 tools/encoder/lifetag_encoder.py --selftest
```

Production: set `DATABASE_URL`, `STAFF_TOKEN`, `ENCODER_TOKEN`, `GCASH_NUMBER`, and `GCASH_NAME` on the host. `npm run build` applies `migrations/` automatically.
`src/routeTree.gen.ts` is generated on first `dev` or `build`.

## How the data reaches the tag

1. Customers use `/order` to submit the form. `POST /api/orders` stores the order as `awaiting_payment` and returns its id and private receipt code.
2. Checkout shows the product amount and GCash/Maya account from `GCASH_NUMBER` and `GCASH_NAME`. The customer submits a payment reference; staff verify it and click **Mark paid** before production can start. No payment gateway is connected.
3. Customers can check progress at `/track` with their order id and private receipt. Staff open `/staff`, enter `STAFF_TOKEN`, and work the order through payload and prep.
4. Encoding, either way:
   - **Phone (Web NFC):** open `/staff` in Chrome on Android over HTTPS, go to Encoding, tap **Write to tag**, hold a blank tag to the phone. The page writes, reads the tag back, compares it, then reports the result to the server. Optional lock makes the tag read-only for good. iPhone and Safari cannot do this.
   - **Desktop (batch):** `tools/encoder/lifetag_encoder.py` pulls the queue, writes each tag on an ACR122U or any PC/SC reader, verifies by read-back, and marks the order encoded. See below.
5. QC and dispatch as before.

If the order API is unavailable, checkout keeps a browser-only copy labeled **not saved on the server**. Staff cannot see or fulfill it; the customer must submit again when the service is available.

## Desktop encoder

```bash
pip install -r tools/encoder/requirements.txt
export ENCODER_TOKEN=...
python3 tools/encoder/lifetag_encoder.py --server https://your-site.example.com
python3 tools/encoder/lifetag_encoder.py --csv orders.csv    # offline: id,payload columns
```

On Windows the reader's own PC/SC driver is enough. On Linux install `pcscd`.
Writes use NTAG213/215/216 pages and wipe older content on the tag, so re-encoding a returned tag is safe.

## API

| Method and path | Who | Purpose |
|---|---|---|
| `POST /api/orders` | public, rate limited | Create an `awaiting_payment` order. Returns only `{ id, receipt }`; keep the private receipt for `/track`. |
| `POST /api/orders/:id/payment-reference` | public, rate limited | Submit a payment reference using the private receipt. The order remains unpaid until staff verifies it. |
| `GET /api/payment-instructions` | public | Returns the configured GCash/Maya account name and number. |
| `GET /api/orders/lookup?id=…&receipt=…` | public, rate limited | Look up order progress using the private receipt. Returns only product, status, tracking note, and progress booleans. |
| `POST /api/orders/:id/reencode` | public, rate limited | Body `{ "receipt": "…", "option": "Re-encode my tag" \| "Replace a lost tag" }`. Files a request for a paid order and returns only `{ "ok": true }`. |
| `GET /api/orders`, `GET/PATCH /api/orders/:id` | `STAFF_TOKEN` | Desk list, read, update steps, paid status, tracking. |
| `GET /api/encoder/queue` | `ENCODER_TOKEN` or `STAFF_TOKEN` | Orders with prep done and no chip written yet, with the exact payload string. |
| `POST /api/encoder/:id/result` | `ENCODER_TOKEN` or `STAFF_TOKEN` | Body `{ "verified": true, "via": "desktop" \| "web-nfc", "uid": "..." }`. Only verified writes are accepted. |

Tokens go in an `Authorization: Bearer <token>` header. Without a configured token the protected routes answer 503.

## Notes

- Customer pages are `/`, `/order`, `/scan`, `/support`, and `/track`. The staff desk is isolated at `/staff`.
- The payload format lives in `src/lib/payload.ts` and is imported by the site client; `npm test` guards it.
- Payload limit is 120 bytes, leaving room for NDEF framing on a 144-byte NTAG213.
- Orders remain `awaiting_payment` until staff marks them paid after reviewing the submitted reference. No payment gateway is connected.
- Design reference images are in `docs/`.
