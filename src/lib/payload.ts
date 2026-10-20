/** Single source of truth for the text written to the NFC chip (server side).
 *  Keep in sync with payloadOf() in public/js/site.js. */
export const MAX_PAYLOAD_BYTES = 120; // NTAG213 holds 144 bytes; NDEF framing needs the rest.

export interface PayloadFields {
  buyer: string;
  blood: string;
  ice: string;
  allergies: string;
  directives?: string | null;
}

export function payloadOf(o: PayloadFields): string {
  const lines = [
    "LIFETAG EMERGENCY INFO",
    `| NAME: ${o.buyer}`,
    `| BLOOD: ${o.blood}`,
    `| ICE: ${o.ice}`,
    `| ALLERGIES: ${o.allergies}`,
  ];
  const note = (o.directives ?? "").trim();
  if (note) lines.push(`| NOTE: ${note}`);
  return lines.join("\n");
}

export function payloadBytes(text: string): number {
  return new TextEncoder().encode(text).length;
}
