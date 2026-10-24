import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { payloadOf } from "@/lib/payload";
import { OrderProfile } from "@/lib/order-validation";
import { orderStepPatchError } from "@/lib/order-steps";

export const PRODUCTS = ["lite", "pro", "duo"] as const;

export const NewOrder = z.object({ product: z.enum(PRODUCTS) }).extend(OrderProfile.shape);

export const OrderPatch = z.object({
  status: z.enum(["new", "awaiting_payment", "paid"]).optional(),
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
  reencode: { option: string } | null;
  steps: Record<string, boolean>;
  tag_uid: string | null;
  encoded_via: string | null;
  encoded_at: string | null;
  payment_reference: string | null;
  created: string;
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
    paymentReference: row.payment_reference,
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

export async function createOrder(input: z.infer<typeof NewOrder>): Promise<{ order: OrderRow; receipt: string }> {
  const sql = await getSql();
  const receipt = randomBytes(32).toString("base64url");
  const receiptHash = createHash("sha256").update(receipt).digest("hex");
  const rows = await sql<OrderRow>`
    insert into orders (id, product, status, buyer, blood, ice, allergies, directives, receipt_hash)
    values (lpad(nextval('order_seq')::text, 3, '0'), ${input.product}, 'awaiting_payment',
    ${input.buyer}, ${input.blood}, ${input.ice}, ${input.allergies}, ${input.directives}, ${receiptHash})
    returning *`;
  return { order: rows[0], receipt };
}

export async function lookupOrder(id: string, receipt: string) {
  const sql = await getSql();
  const receiptHash = createHash("sha256").update(receipt).digest("hex");
  const rows = await sql<Pick<OrderRow, "id" | "product" | "status" | "tracking" | "steps" | "reencode">>`
    select id, product, status, tracking, steps, reencode from orders
    where id = ${id} and receipt_hash = ${receiptHash}`;
  const row = rows[0];
  if (!row) return null;

  const status = row.status === "awaiting_payment"
    ? row.steps.paymentReferenceSubmitted
      ? "Payment reference received · awaiting staff verification"
      : "Awaiting payment"
    : row.steps.shipped
      ? "Shipped"
      : row.steps.encoded
        ? "Encoding complete"
        : row.reencode
          ? "Re-encode requested"
        : row.steps.prepDone
          ? "In production"
          : row.status === "paid"
            ? "Paid · awaiting production"
            : "Order received";
  return {
    id: row.id,
    product: row.product,
    status,
    tracking: row.tracking,
    generated: !!row.steps.generated,
    prepDone: !!row.steps.prepDone,
    encoded: !!row.steps.encoded,
    qc: !!row.steps.qc,
    shipped: !!row.steps.shipped,
    reencodeRequested: !!row.reencode,
  };
}

export async function submitPaymentReference(id: string, receipt: string, paymentReference: string): Promise<boolean> {
  const sql = await getSql();
  const receiptHash = createHash("sha256").update(receipt).digest("hex");
  const rows = await sql`
    update orders set
      payment_reference = ${paymentReference},
      steps = steps || '{"paymentReferenceSubmitted": true}'::jsonb
    where id = ${id} and receipt_hash = ${receiptHash} and status = 'awaiting_payment'
    returning id`;
  return rows.length > 0;
}

export async function patchOrder(id: string, patch: z.infer<typeof OrderPatch>): Promise<OrderRow | null> {
  const sql = await getSql();
  const current = await getOrder(id);
  if (!current) return null;
  if (patch.status === "paid" && !current.payment_reference) {
    throw new Error("A payment reference is required before marking this order paid.");
  }
  const stepError = orderStepPatchError(current.status, current.steps, patch);
  if (stepError) throw new Error(stepError);
  const steps = { ...current.steps, ...(patch.steps ?? {}) };
  const rows = await sql<OrderRow>`
    update orders set
      status   = ${patch.status ?? current.status},
      tracking = ${patch.tracking ?? current.tracking},
      steps    = ${JSON.stringify(steps)}::jsonb
    where id = ${id} returning *`;
  return rows[0] ?? null;
}

export async function requestReencode(id: string, receipt: string, option: string): Promise<boolean> {
  const sql = await getSql();
  const receiptHash = createHash("sha256").update(receipt).digest("hex");
  const rows = await sql`
    update orders set
      reencode = ${JSON.stringify({ option })}::jsonb,
      steps = steps || jsonb_build_object(
        'prepDone', true,
        'shipped', false,
        'encoded', false,
        'qc', false
      )
    where id = ${id} and receipt_hash = ${receiptHash} and status = 'paid' returning id`;
  return rows.length > 0;
}

/** Orders whose prep is done but whose chip has not been written yet. */
export async function encodingQueue(): Promise<OrderRow[]> {
  const sql = await getSql();
  return sql<OrderRow>`
    select * from orders
    where status = 'paid'
      and coalesce((steps->>'prepDone')::boolean, false)
      and not coalesce((steps->>'encoded')::boolean, false)
    order by created asc, id asc`;
}

export async function markEncoded(id: string, via: string, uid: string | null): Promise<OrderRow | null> {
  const sql = await getSql();
  const rows = await sql<OrderRow>`
    update orders set
      steps = steps || '{"encoded": true, "generated": true}'::jsonb,
      tag_uid = ${uid}, encoded_via = ${via}, encoded_at = now()
    where id = ${id} and status = 'paid'
      and coalesce((steps->>'prepDone')::boolean, false) returning *`;
  return rows[0] ?? null;
}
