# LifeTag

Offline NFC emergency ID. Customers order on the site, staff prepare and encode the tag, and a responder taps it to read plain text with no app or signal.

## Run

```bash
cp .env.example .env      # set STAFF_TOKEN and ENCODER_TOKEN
npm install
npm run dev               # http://localhost:8080 (embedded PGLite database)
npm test                  # payload format test
python3 tools/encoder/lifetag_encoder.py --selftest
```

Production: set `DATABASE_URL`, `STAFF_TOKEN`, `ENCODER_TOKEN` on the host. `npm run build` applies `migrations/` automatically.
`src/routeTree.gen.ts` is generated on first `dev` or `build`.

## How the data reaches the tag

1. Customer submits the form. `POST /api/orders` stores the order and returns its id.
2. Staff open **Fulfillment**, enter `STAFF_TOKEN`, and work the order through payload and prep.
3. Encoding, either way:
   - **Phone (Web NFC):** open the site in Chrome on Android over HTTPS, go to Encoding, tap **Write to tag**, hold a blank tag to the phone. The page writes, reads the tag back, compares it, then reports the result to the server. Optional lock makes the tag read-only for good. iPhone and Safari cannot do this.
   - **Desktop (batch):** `tools/encoder/lifetag_encoder.py` pulls the queue, writes each tag on an ACR122U or any PC/SC reader, verifies by read-back, and marks the order encoded. See below.
4. QC and dispatch as before.

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
| `POST /api/orders` | public, rate limited | Create an order. Returns only `{ id }`. |
| `POST /api/orders/:id/reencode` | public, rate limited | Customer re-encode request. Returns no order data. |
| `GET /api/orders`, `GET/PATCH /api/orders/:id` | `STAFF_TOKEN` | Desk list, read, update steps, paid status, tracking. |
| `GET /api/encoder/queue` | `ENCODER_TOKEN` or `STAFF_TOKEN` | Orders with prep done and no chip written yet, with the exact payload string. |
| `POST /api/encoder/:id/result` | `ENCODER_TOKEN` or `STAFF_TOKEN` | Body `{ "verified": true, "via": "desktop" \| "web-nfc", "uid": "..." }`. Only verified writes are accepted. |

Tokens go in an `Authorization: Bearer <token>` header. Without a configured token the protected routes answer 503.

## Notes

- The payload format lives in `src/lib/payload.ts` and `public/js/site.js` (`payloadOf`). Change both together; `npm test` guards the server copy.
- Payload limit is 120 bytes, leaving room for NDEF framing on a 144-byte NTAG213.
- The fake "paid" status and the absence of a payment gateway are unchanged from the demo.
- Design reference images are in `docs/`.
