import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requestReencode } from "@/lib/orders.server";
import { json, tooMany } from "@/lib/staff-token.server";

const Body = z.object({
  option: z.string().trim().min(1).max(60),
  details: z.string().trim().min(1).max(180),
});

export const Route = createFileRoute("/api/orders/$id/reencode")({
  server: {
    handlers: {
      // Customer support form (public). Never returns order data.
      POST: async ({ request, params }) => {
        if (tooMany(request, "reencode")) return json(429, { error: "Too many requests. Try again soon." });
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json(400, { error: "Invalid request." });
        const ok = await requestReencode(params.id, parsed.data.option, parsed.data.details);
        return ok ? json(200, { ok: true }) : json(404, { error: "Order not found." });
      },
    },
  },
});
