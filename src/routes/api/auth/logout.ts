import { createFileRoute } from "@tanstack/react-router";
import { clearStaffSessionCookie, json } from "@/lib/auth.server";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async () => json(200, { ok: true }, { "set-cookie": clearStaffSessionCookie() }),
    },
  },
});
