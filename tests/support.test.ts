import { test } from "node:test";
import assert from "node:assert/strict";
import { NewSupportTicket, SupportTicketStatus } from "../src/lib/support-validation.ts";

test("support inquiry requires valid contact details and a useful message", () => {
  const ticket = NewSupportTicket.safeParse({
    category: "general",
    name: "  Jane Doe  ",
    email: "jane@example.com",
    orderId: " 012 ",
    message: "Please help me with my order.",
  });
  assert.equal(ticket.success, true);
  if (ticket.success) {
    assert.equal(ticket.data.name, "Jane Doe");
    assert.equal(ticket.data.orderId, "012");
  }

  assert.equal(NewSupportTicket.safeParse({
    name: "Jane",
    email: "not-an-email",
    message: "Please help with my order.",
  }).success, false);
  assert.equal(NewSupportTicket.safeParse({
    name: "Jane",
    email: "jane@example.com",
    message: "short",
  }).success, false);
});

test("RE-ENCODE requests require an order ID", () => {
  const fields = {
    category: "reencode",
    name: "Jane Doe",
    email: "jane@example.com",
    message: "Please re-encode my LifeTag order.",
  };
  assert.equal(NewSupportTicket.safeParse(fields).success, false);
  assert.equal(NewSupportTicket.safeParse({ ...fields, orderId: "012" }).success, true);
});

test("support ticket status only accepts open or resolved", () => {
  assert.equal(SupportTicketStatus.safeParse({ status: "resolved" }).success, true);
  assert.equal(SupportTicketStatus.safeParse({ status: "open" }).success, true);
  assert.equal(SupportTicketStatus.safeParse({ status: "deleted" }).success, false);
});
