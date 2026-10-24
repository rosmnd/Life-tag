LifeTag is a real public ordering site for offline NFC emergency tags, being deployed for customers in Pasig. It is not a certified medical device. Do not call it one.

The chip stores plain NDEF text. Anyone who taps it can read it with no app and no internet. Never claim the tag, the payload, or "the profile" is encrypted. Say that clearly in the privacy notice and checkout.

Server-side personal data is restricted: HTTPS, username/password staff login with server-verified sessions, unguessable receipts, no public order list, and no medical fields on public APIs. Hosted Postgres access control is the protection for the database. Do not invent encryption that the code does not actually do.

Keep TanStack Start. Do not downgrade @tanstack/react-start below 1.168.60. Keep the current design, prices, and payload format in src/lib/payload.ts. One payloadOf only.

Products: lite ₱39, pro ₱59, duo ₱99. Name example: "Dela Cruz, Juan". Blood: A+ A- B+ B- AB+ AB- O+ O- Unknown. Contact: exactly 11 digits. Allergies required. Note optional. Payload max 120 UTF-8 bytes.

Do not commit .env, credentials, or real customer data.