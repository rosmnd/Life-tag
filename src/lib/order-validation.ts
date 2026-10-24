import { z } from "zod";
import { MAX_PAYLOAD_BYTES, payloadBytes, payloadOf } from "./payload.ts";

export const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"] as const;

export const ORDER_VALIDATION_MESSAGES = {
  buyerRequired: "Name is required.",
  buyerLength: "Name must be 1–40 characters.",
  buyerComma: "Enter last name first, then first name, separated by a comma.",
  blood: "Select one of the listed blood types.",
  ice: "Enter an emergency contact number with exactly 11 digits.",
  allergiesRequired: "Enter allergies or conditions (use None if there are none).",
  allergiesLength: "Allergies / conditions must be 1–48 characters.",
  directivesLength: "Optional note must be 0–60 characters.",
  payload: "That profile exceeds the safe 120-byte limit. Shorten a field.",
} as const;

export const OrderProfile = z.object({
  buyer: z.string({ error: ORDER_VALIDATION_MESSAGES.buyerRequired }).trim().min(1, ORDER_VALIDATION_MESSAGES.buyerRequired)
    .max(40, ORDER_VALIDATION_MESSAGES.buyerLength)
    .refine((value) => value.includes(","), ORDER_VALIDATION_MESSAGES.buyerComma),
  blood: z.enum(BLOOD_TYPES, { error: ORDER_VALIDATION_MESSAGES.blood }),
  ice: z.string({ error: ORDER_VALIDATION_MESSAGES.ice }).trim().regex(/^\d{11}$/, ORDER_VALIDATION_MESSAGES.ice),
  allergies: z.string({ error: ORDER_VALIDATION_MESSAGES.allergiesRequired }).trim().min(1, ORDER_VALIDATION_MESSAGES.allergiesRequired)
    .max(48, ORDER_VALIDATION_MESSAGES.allergiesLength),
  directives: z.string({ error: ORDER_VALIDATION_MESSAGES.directivesLength })
    .trim().max(60, ORDER_VALIDATION_MESSAGES.directivesLength).default(""),
});

export type OrderProfileFields = z.infer<typeof OrderProfile>;

export function validateOrderProfile(input: unknown): { success: true; data: OrderProfileFields } | { success: false; message: string } {
  const parsed = OrderProfile.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0].message };

  if (payloadBytes(payloadOf(parsed.data)) > MAX_PAYLOAD_BYTES) {
    return { success: false, message: ORDER_VALIDATION_MESSAGES.payload };
  }
  return { success: true, data: parsed.data };
}
