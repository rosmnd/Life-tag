import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { markEncoded } from "@/lib/orders.server";
import { json, requireToken } from "@/lib/staff-token.server";

const Body = z.object({
  verified: z.literal(true), // the writer must have read the tag back and matched it
  via: z.enum(["web-nfc", "desktop"]).default("desktop"),
  uid: z.string().max(40).nullable().optional(),
});

export const Route = createFileRoute("/api/encoder/$id/result")({
  server: {
    handlers: {
      // Called after a successful write + read-back verification.
      POST: async ({ request, params }) => {
        const denied = requireToken(request, ["encoder", "staff"]);
        if (denied) return denied;
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json(400, { error: "Only verified writes can be recorded." });
        const row = await markEncoded(params.id, parsed.data.via, parsed.data.uid ?? null);
        return row ? json(200, { ok: true, id: row.id }) : json(404, { error: "Order not found." });
      },
    },
  },
});
