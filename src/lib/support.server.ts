import { z } from "zod";
import { getSql } from "@/lib/db";
import { NewSupportTicket, SupportTicketStatus } from "@/lib/support-validation";

export interface SupportTicketRow {
  id: string;
  name: string;
  email: string;
  category: "general" | "reencode";
  order_id: string;
  message: string;
  status: "open" | "resolved";
  created: string;
  updated: string;
}

export async function listSupportTickets(): Promise<SupportTicketRow[]> {
  const sql = await getSql();
  return sql<SupportTicketRow>`
    select id::text, name, email, category, order_id, message, status, created, updated
    from support_tickets
    order by created desc, id desc
    limit 200`;
}

export async function createSupportTicket(input: z.infer<typeof NewSupportTicket>): Promise<void> {
  const sql = await getSql();
  await sql`
    insert into support_tickets (name, email, category, order_id, message)
    values (${input.name}, ${input.email}, ${input.category}, ${input.orderId ?? ""}, ${input.message})`;
}

export async function updateSupportTicketStatus(
  id: string,
  status: z.infer<typeof SupportTicketStatus>["status"],
): Promise<SupportTicketRow | null> {
  const sql = await getSql();
  const rows = await sql<SupportTicketRow>`
    update support_tickets
    set status = ${status}, updated = now()
    where id = ${id}
    returning id::text, name, email, category, order_id, message, status, created, updated`;
  return rows[0] ?? null;
}
