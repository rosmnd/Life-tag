import { z } from "zod";
import { getSql } from "@/lib/db";
import { MAX_PAYLOAD_BYTES, payloadBytes, payloadOf } from "@/lib/payload";

export const PRODUCTS = ["lite", "pro", "duo"] as const;

export const NewOrder = z.object({
  product: z.enum(PRODUCTS),
  buyer: z.string().trim().min(1).max(40),
  blood: z.string().trim().min(1).max(4),
  ice: z.string().trim().min(10).max(24),
  allergies: z.string().trim().min(1).max(48),
  directives: z.string().trim().max(60).default(""),
});

export const OrderPatch = z.object({
  status: z.enum(["new", "paid"]).optional(),
  tracking: z.string().max(80).optional(),
  steps: z.record(z.string(), z.boolean()).optional(),
});

export interface OrderRow {
  id: string;
  product: (typeof PRODUCTS)[number];
  status: string;
  buyer: string;
  blood: string;
  ice: string;
  allergies: string;
  directives: string;
  tracking: string;
  reencode: { option: string; details: string } | null;
  steps: Record<string, boolean>;
  tag_uid: string | null;
  encoded_via: string | null;
  encoded_at: string | null;
  created: string;
}

export function fits(order: Pick<OrderRow, "buyer" | "blood" | "ice" | "allergies" | "directives">) {
  return payloadBytes(payloadOf(order)) <= MAX_PAYLOAD_BYTES;
}

/** Shape the client (public/js/site.js) already understands. */
export function toClient(row: OrderRow) {
  return {
    id: row.id,
    product: row.product,
    status: row.status,
    buyer: row.buyer,
    blood: row.blood,
    ice: row.ice,
    allergies: row.allergies,
    directives: row.directives,
    tracking: row.tracking,
    reencode: row.reencode,
    steps: row.steps,
    tagUid: row.tag_uid,
    encodedVia: row.encoded_via,
    created: row.created,
    payload: payloadOf(row),
  };
}

export async function listOrders(): Promise<OrderRow[]> {
  const sql = await getSql();
  return sql<OrderRow>`select * from orders order by created desc, id desc`;
}

export async function getOrder(id: string): Promise<OrderRow | null> {
  const sql = await getSql();
  const rows = await sql<OrderRow>`select * from orders where id = ${id}`;
  return rows[0] ?? null;
}

export async function createOrder(input: z.infer<typeof NewOrder>): Promise<OrderRow> {
  const sql = await getSql();
  const rows = await sql<OrderRow>`
    insert into orders (id, product, status, buyer, blood, ice, allergies, directives)
    values (lpad(nextval('order_seq')::text, 3, '0'), ${input.product}, 'paid',
            ${input.buyer}, ${input.blood}, ${input.ice}, ${input.allergies}, ${input.directives})
    returning *`;
  return rows[0];
}

export async function patchOrder(id: string, patch: z.infer<typeof OrderPatch>): Promise<OrderRow | null> {
  const sql = await getSql();
  const current = await getOrder(id);
  if (!current) return null;
  const steps = { ...current.steps, ...(patch.steps ?? {}) };
  const rows = await sql<OrderRow>`
    update orders set
      status   = ${patch.status ?? current.status},
      tracking = ${patch.tracking ?? current.tracking},
      steps    = ${JSON.stringify(steps)}::jsonb
    where id = ${id} returning *`;
  return rows[0] ?? null;
}

export async function requestReencode(id: string, option: string, details: string): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql`
    update orders set
      reencode = ${JSON.stringify({ option, details })}::jsonb,
      steps = steps || '{"prepDone": true, "shipped": false, "encoded": false, "qc": false}'::jsonb
    where id = ${id} returning id`;
  return rows.length > 0;
}

/** Orders whose prep is done but whose chip has not been written yet. */
export async function encodingQueue(): Promise<OrderRow[]> {
  const sql = await getSql();
  return sql<OrderRow>`
    select * from orders
    where coalesce((steps->>'prepDone')::boolean, false)
      and not coalesce((steps->>'encoded')::boolean, false)
    order by created asc, id asc`;
}

export async function markEncoded(id: string, via: string, uid: string | null): Promise<OrderRow | null> {
  const sql = await getSql();
  const rows = await sql<OrderRow>`
    update orders set
      steps = steps || '{"encoded": true, "generated": true}'::jsonb,
      tag_uid = ${uid}, encoded_via = ${via}, encoded_at = now()
    where id = ${id} returning *`;
  return rows[0] ?? null;
}
