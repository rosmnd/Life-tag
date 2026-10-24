import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  createStaffSessionCookie,
  json,
  loginRateLimited,
  staffConfigError,
  verifyStaffCredentials,
} from "@/lib/auth.server";

const Body = z.object({
  username: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(1024),
});

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (loginRateLimited(request)) return json(429, { error: "Login unavailable. Try again later." });
        const configurationError = staffConfigError();
        if (configurationError) return json(503, { error: configurationError });

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json(401, { error: "Invalid username or password." });
        if (!(await verifyStaffCredentials(parsed.data.username, parsed.data.password))) {
          return json(401, { error: "Invalid username or password." });
        }

        return json(200, { ok: true }, { "set-cookie": createStaffSessionCookie() });
      },
    },
  },
});
