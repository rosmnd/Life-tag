import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/auth.server";

export const Route = createFileRoute("/api/payment-instructions")({
  server: {
    handlers: {
      GET: async () => {
        const number = process.env.GCASH_NUMBER?.trim();
        const name = process.env.GCASH_NAME?.trim();
        return number && name
          ? json(200, { number, name })
          : json(503, { error: "GCASH_NUMBER and GCASH_NAME are not configured. Contact us before paying." });
      },
    },
  },
});
