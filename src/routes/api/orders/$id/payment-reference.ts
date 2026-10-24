import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { submitPaymentReference } from "@/lib/orders.server";
import { json, tooMany } from "@/lib/staff-token.server";

const Body = z.object({
  receipt: z.string().min(32).max(64),
  reference: z.string().trim().min(1).max(80),
});

export const Route = createFileRoute("/api/orders/$id/payment-reference")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        if (tooMany(request, "payment-reference")) return json(429, { error: "Too many requests. Try again soon." });
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json(400, { error: "Payment reference must be 1–80 characters." });
        const ok = await submitPaymentReference(params.id, parsed.data.receipt, parsed.data.reference);
        return ok
          ? json(200, { ok: true })
          : json(404, { error: "Order not found or payment reference was already submitted." });
      },
    },
  },
});
