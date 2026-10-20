import { createFileRoute } from "@tanstack/react-router";
import { NewOrder, createOrder, fits, listOrders, toClient } from "@/lib/orders.server";
import { json, requireToken, tooMany } from "@/lib/staff-token.server";

export const Route = createFileRoute("/api/orders/")({
  server: {
    handlers: {
      // Fulfillment desk: all orders (staff token).
      GET: async ({ request }) => {
        const denied = requireToken(request, ["staff"]);
        if (denied) return denied;
        const rows = await listOrders();
        return json(200, { orders: rows.map(toClient) });
      },

      // Customer checkout: create an order (public, rate limited).
      POST: async ({ request }) => {
        if (tooMany(request, "create-order")) return json(429, { error: "Too many requests. Try again soon." });
        const parsed = NewOrder.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json(400, { error: "Invalid order.", issues: parsed.error.issues });
        if (!fits(parsed.data)) return json(400, { error: "Profile is too long for an NTAG213 chip." });
        const row = await createOrder(parsed.data);
        // Only the id goes back to the public caller, never other customers' data.
        return json(201, { id: row.id });
      },
    },
  },
});
