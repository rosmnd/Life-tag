import { createHmac, scryptSync } from "node:crypto";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clearStaffSessionCookie,
  createStaffSessionCookie,
  hasStaffSession,
  requireStaffSession,
  staffConfigError,
  verifyStaffCredentials,
} from "../src/lib/auth.server.ts";

test("staff credentials and signed sessions are verified server-side", async () => {
  const names = ["STAFF_PASSWORD_HASH", "STAFF_SESSION_SECRET", "NODE_ENV"] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  const salt = Buffer.from("fedcba9876543210fedcba9876543210", "hex");
  const sessionSecret = "a".repeat(64);
  const digest = scryptSync("test-password-not-for-production", salt, 64);

  try {
    process.env.STAFF_PASSWORD_HASH = `scrypt:${salt.toString("hex")}:${digest.toString("hex")}`;
    process.env.STAFF_SESSION_SECRET = sessionSecret;
    process.env.NODE_ENV = "production";

    assert.equal(staffConfigError(), null);
    for (const username of ["Duane", "Kenneth", "Lance", "Rosemande", "dUaNe"]) {
      assert.equal(await verifyStaffCredentials(username, "test-password-not-for-production"), true);
    }
    assert.equal(await verifyStaffCredentials("wrong-user", "test-password-not-for-production"), false);
    assert.equal(await verifyStaffCredentials("test-staff", "test-password-not-for-production"), false);
    assert.equal(await verifyStaffCredentials("test-staff", "wrong-password"), false);

    const cookie = createStaffSessionCookie();
    assert.match(cookie, /; HttpOnly;/);
    assert.match(cookie, /; SameSite=Strict;/);
    assert.match(cookie, /; Secure/);
    const request = new Request("https://example.test/api/orders", {
      headers: { cookie: cookie.split(";")[0] },
    });
    assert.equal(hasStaffSession(request), true);
    const signedCookie = cookie.split(";")[0];
    const lastCharacter = signedCookie.slice(-1);
    const tamperedCookie = signedCookie.slice(0, -1) + (lastCharacter === "a" ? "b" : "a");
    assert.equal(hasStaffSession(new Request(request.url, {
      headers: { cookie: tamperedCookie },
    })), false);
    assert.equal(requireStaffSession(request), null);
    assert.equal(requireStaffSession(new Request(request.url))?.status, 401);

    const expiredValue = String(Math.floor(Date.now() / 1000) - 1);
    const expiredSignature = createHmac("sha256", sessionSecret)
      .update(expiredValue)
      .digest("base64url");
    assert.equal(hasStaffSession(new Request(request.url, {
      headers: { cookie: `lifetag_staff_session=${expiredValue}.${expiredSignature}` },
    })), false);

    assert.match(clearStaffSessionCookie(), /Max-Age=0; Secure/);
  } finally {
    for (const name of names) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("staff configuration fails clearly when credentials are absent", () => {
  const previous = ["STAFF_PASSWORD_HASH", "STAFF_SESSION_SECRET"]
    .map((name) => [name, process.env[name]] as const);
  try {
    delete process.env.STAFF_PASSWORD_HASH;
    delete process.env.STAFF_SESSION_SECRET;
    assert.match(staffConfigError() ?? "", /STAFF_PASSWORD_HASH and a 32-byte STAFF_SESSION_SECRET/);
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
