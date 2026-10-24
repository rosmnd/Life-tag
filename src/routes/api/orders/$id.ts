import { createFileRoute } from "@tanstack/react-router";
import { OrderPatch, getOrder, patchOrder, toClient } from "@/lib/orders.server";
import { json, requireToken } from "@/lib/staff-token.server";

export const Route = createFileRoute("/api/orders/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const denied = requireToken(request, ["staff"]);
        if (denied) return denied;
        const row = await getOrder(params.id);
        return row ? json(200, toClient(row)) : json(404, { error: "Order not found." });
      },

      // Desk updates: paid status, tracking note, step checkboxes.
      PATCH: async ({ request, params }) => {
        const denied = requireToken(request, ["staff"]);
        if (denied) return denied;
        const parsed = OrderPatch.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json(400, { error: "Invalid update.", issues: parsed.error.issues });
        try {
          const row = await patchOrder(params.id, parsed.data);
          return row ? json(200, toClient(row)) : json(404, { error: "Order not found." });
        } catch (error) {
          if (error instanceof Error) return json(400, { error: error.message });
          throw error;
        }
      },
    },
  },
});
