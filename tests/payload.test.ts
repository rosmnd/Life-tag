import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_PAYLOAD_BYTES, payloadBytes, payloadOf } from "../src/lib/payload.ts";
import { ORDER_VALIDATION_MESSAGES, validateOrderProfile } from "../src/lib/order-validation.ts";
import { orderStepPatchError } from "../src/lib/order-steps.ts";

test("payload matches the format displayed by the site", () => {
  const text = payloadOf({ buyer: "Dela Cruz, Juan", blood: "O+", ice: "09171234567", allergies: "Penicillin" });
  assert.equal(
    text,
    "LIFETAG\n| NAME: Dela Cruz, Juan\n| BLOOD: O+\n| EMERGENCY CONTACT: 09171234567\n| ALLERGIES: Penicillin",
  );
  assert.ok(payloadBytes(text) <= MAX_PAYLOAD_BYTES);

  const formattedText = payloadOf({
    buyer: "Long Last Name, First Name",
    blood: "O+",
    ice: "09171234567",
    allergies: "Penicillin",
  });
  assert.ok(payloadBytes(formattedText) <= MAX_PAYLOAD_BYTES);
});

test("note line is added only when present", () => {
  const base = { buyer: "A", blood: "B+", ice: "0917 000 0000", allergies: "None" };
  assert.ok(!payloadOf({ ...base, directives: "  " }).includes("NOTE"));
  assert.ok(payloadOf({ ...base, directives: "No transfusion" }).endsWith("| NOTE: No transfusion"));
});

test("checkout validation requires the agreed profile fields", () => {
  const valid = {
    buyer: "Dela Cruz, Juan",
    blood: "Unknown",
    ice: "09171234567",
    allergies: "None",
    directives: "",
  };
  assert.equal(validateOrderProfile(valid).success, true);
  assert.deepEqual(validateOrderProfile({ ...valid, buyer: "Juan Dela Cruz" }), {
    success: false,
    message: ORDER_VALIDATION_MESSAGES.buyerComma,
  });
  assert.deepEqual(validateOrderProfile({ ...valid, blood: "X+" }), {
    success: false,
    message: ORDER_VALIDATION_MESSAGES.blood,
  });
  assert.deepEqual(validateOrderProfile({ ...valid, ice: "0917123456A" }), {
    success: false,
    message: ORDER_VALIDATION_MESSAGES.ice,
  });
  assert.deepEqual(validateOrderProfile({ ...valid, allergies: "" }), {
    success: false,
    message: ORDER_VALIDATION_MESSAGES.allergiesRequired,
  });
  assert.deepEqual(validateOrderProfile({ ...valid, directives: "n".repeat(61) }), {
    success: false,
    message: ORDER_VALIDATION_MESSAGES.directivesLength,
  });
  assert.deepEqual(validateOrderProfile({ ...valid, allergies: "é".repeat(48) }), {
    success: false,
    message: ORDER_VALIDATION_MESSAGES.payload,
  });
});

test("Unknown blood type and an exactly 11-digit contact are accepted", () => {
  assert.equal(validateOrderProfile({
    buyer: "Doe, Jane",
    blood: "Unknown",
    ice: "09171234567",
    allergies: "None",
    directives: "",
  }).success, true);
});

test("profiles over 120 UTF-8 bytes are rejected", () => {
  const result = validateOrderProfile({
    buyer: "Long family, Long given name",
    blood: "Unknown",
    ice: "09171234567",
    allergies: "é".repeat(48),
    directives: "",
  });
  assert.deepEqual(result, {
    success: false,
    message: ORDER_VALIDATION_MESSAGES.payload,
  });
});

test("blank notes are omitted from payload", () => {
  const profile = { buyer: "Doe, Jane", blood: "Unknown", ice: "09171234567", allergies: "None" };
  assert.equal(payloadOf({ ...profile, directives: "  \n " }).includes("| NOTE:"), false);
});

test("preparation cannot be completed before all paid production checks", () => {
  assert.match(orderStepPatchError("paid", {}, { steps: { prepDone: true } }) ?? "", /sanitize, print, laminate, and pack/);
  assert.match(orderStepPatchError("awaiting_payment", {}, {
    steps: { sanitize: true, print: true, laminate: true, pack: true, prepDone: true },
  }) ?? "", /paid/);

  const ready = { sanitize: true, print: true, laminate: true, pack: true };
  assert.equal(orderStepPatchError("paid", ready, { steps: { prepDone: true } }), null);
  assert.match(orderStepPatchError("paid", { ...ready, prepDone: true }, { status: "awaiting_payment" }) ?? "", /paid/);
});

test("QC requires all four order quality checks", () => {
  const checks = { qcProfile: true, qcProduct: true, qcPackage: true, qcOrder: true };
  assert.match(orderStepPatchError("paid", {}, { steps: { qc: true } }) ?? "", /all order quality checks/);
  assert.equal(orderStepPatchError("paid", checks, { steps: { qc: true } }), null);
});

test("shipping requires QC approval", () => {
  assert.match(orderStepPatchError("paid", {}, { steps: { shipped: true } }) ?? "", /Approve QC/);
  assert.equal(orderStepPatchError("paid", {
    qcProfile: true,
    qcProduct: true,
    qcPackage: true,
    qcOrder: true,
    qc: true,
  }, { steps: { shipped: true } }), null);
});
