import { z } from "zod";

export const NewSupportTicket = z.object({
  category: z.enum(["general", "reencode"]).default("general"),
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  orderId: z.string().trim().max(32).optional().default(""),
  message: z.string().trim().min(10).max(2000),
}).superRefine((ticket, context) => {
  if (ticket.category === "reencode" && !ticket.orderId) {
    context.addIssue({
      code: "custom",
      path: ["orderId"],
      message: "Enter the order ID for a re-encode request.",
    });
  }
});

export const SupportTicketStatus = z.object({
  status: z.enum(["open", "resolved"]),
});
