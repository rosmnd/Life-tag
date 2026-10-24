import { createFileRoute } from "@tanstack/react-router";
import { createSupportTicket, listSupportTickets } from "@/lib/support.server";
import { NewSupportTicket } from "@/lib/support-validation";
import { json, requireStaffSession, tooMany } from "@/lib/auth.server";

export const Route = createFileRoute("/api/support/tickets/")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = requireStaffSession(request);
        if (denied) return denied;
        return json(200, { tickets: await listSupportTickets() });
      },
      POST: async ({ request }) => {
        if (tooMany(request, "support-ticket", 5, 60 * 60 * 1000)) {
          return json(429, { error: "Too many inquiries. Try again later." });
        }
        const parsed = NewSupportTicket.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json(400, { error: parsed.error.issues[0].message });
        await createSupportTicket(parsed.data);
        return json(201, { ok: true });
      },
    },
  },
});
