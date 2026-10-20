import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_PAYLOAD_BYTES, payloadBytes, payloadOf } from "../src/lib/payload.ts";

test("payload matches the format the site and encoder use", () => {
  const text = payloadOf({ buyer: "Juan Dela Cruz", blood: "O+", ice: "0917XXXXXXX", allergies: "Penicillin" });
  assert.equal(
    text,
    "LIFETAG EMERGENCY INFO\n| NAME: Juan Dela Cruz\n| BLOOD: O+\n| ICE: 0917XXXXXXX\n| ALLERGIES: Penicillin",
  );
  assert.ok(payloadBytes(text) <= MAX_PAYLOAD_BYTES);
});

test("note line is added only when present", () => {
  const base = { buyer: "A", blood: "B+", ice: "0917 000 0000", allergies: "None" };
  assert.ok(!payloadOf({ ...base, directives: "  " }).includes("NOTE"));
  assert.ok(payloadOf({ ...base, directives: "No transfusion" }).endsWith("| NOTE: No transfusion"));
});
