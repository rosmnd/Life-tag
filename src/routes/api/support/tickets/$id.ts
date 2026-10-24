import { createFileRoute } from "@tanstack/react-router";
import { updateSupportTicketStatus } from "@/lib/support.server";
import { SupportTicketStatus } from "@/lib/support-validation";
import { json, requireStaffSession } from "@/lib/auth.server";

export const Route = createFileRoute("/api/support/tickets/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        const denied = requireStaffSession(request);
        if (denied) return denied;
        if (!/^\d{1,18}$/.test(params.id)) return json(400, { error: "Invalid inquiry ID." });
        const parsed = SupportTicketStatus.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json(400, { error: "Choose a valid inquiry status." });
        const ticket = await updateSupportTicketStatus(params.id, parsed.data.status);
        return ticket ? json(200, { ticket }) : json(404, { error: "Inquiry not found." });
      },
    },
  },
});
