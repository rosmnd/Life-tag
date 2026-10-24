import { createFileRoute } from "@tanstack/react-router";
import { lookupOrder } from "@/lib/orders.server";
import { json, tooMany } from "@/lib/auth.server";

export const Route = createFileRoute("/api/orders/lookup")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (tooMany(request, "track-order")) return json(429, { error: "Too many requests. Try again soon." });
        const url = new URL(request.url);
        const id = url.searchParams.get("id")?.trim() ?? "";
        const receipt = url.searchParams.get("receipt")?.trim() ?? "";
        if (!/^\d{1,8}$/.test(id) || receipt.length < 32 || receipt.length > 64) {
          return json(404, { error: "Order not found." });
        }
        const order = await lookupOrder(id, receipt);
        return order ? json(200, order) : json(404, { error: "Order not found." });
      },
    },
  },
});
