import { createFileRoute } from "@tanstack/react-router";
import { NewOrder, createOrder, listOrders, toClient } from "@/lib/orders.server";
import { ORDER_VALIDATION_MESSAGES, validateOrderProfile } from "@/lib/order-validation";
import { json, requireStaffSession, tooMany } from "@/lib/auth.server";

export const Route = createFileRoute("/api/orders/")({
  server: {
    handlers: {
      // Fulfillment desk: all orders (staff session).
      GET: async ({ request }) => {
        const denied = requireStaffSession(request);
        if (denied) return denied;
        const rows = await listOrders();
        return json(200, { orders: rows.map(toClient) });
      },

      // Customer checkout: create an order (public, rate limited).
      POST: async ({ request }) => {
        if (tooMany(request, "create-order")) return json(429, { error: "Too many requests. Try again soon." });
        const parsed = NewOrder.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json(400, { error: parsed.error.issues[0].message });
        const profile = validateOrderProfile(parsed.data);
        if (!profile.success) return json(400, { error: profile.message || ORDER_VALIDATION_MESSAGES.payload });
        const { order, receipt } = await createOrder(parsed.data);
        return json(201, { id: order.id, receipt });
      },
    },
  },
});
