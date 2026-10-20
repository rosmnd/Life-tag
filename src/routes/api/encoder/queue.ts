import { createFileRoute } from "@tanstack/react-router";
import { encodingQueue, toClient } from "@/lib/orders.server";
import { json, requireToken } from "@/lib/staff-token.server";

export const Route = createFileRoute("/api/encoder/queue")({
  server: {
    handlers: {
      // Desktop script: orders that finished prep and still need a chip write.
      GET: async ({ request }) => {
        const denied = requireToken(request, ["encoder", "staff"]);
        if (denied) return denied;
        const rows = await encodingQueue();
        return json(200, {
          queue: rows.map((r) => ({ id: r.id, buyer: r.buyer, product: r.product, payload: toClient(r).payload })),
        });
      },
    },
  },
});
