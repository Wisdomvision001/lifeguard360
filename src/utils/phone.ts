import { z } from "zod";

/**
 * Phone normalisation for the Nigerian deployment context.
 * Contacts are stored in E.164 (+234XXXXXXXXXX); the UI accepts common local
 * forms and normalises before validation. This is presentation-layer
 * validation only — Firestore rules enforce structure server-side.
 */

const E164_NG = /^\+234\d{10}$/;

/** Normalise common Nigerian phone formats to E.164, or null when invalid. */
export function toE164Nigerian(input: string): string | null {
  const digits = input.replace(/[\s()\-.]/g, "");
  let local: string;

  if (digits.startsWith("+234")) {
    local = digits.slice(4);
  } else if (digits.startsWith("234")) {
    local = digits.slice(3);
  } else if (digits.startsWith("0")) {
    local = digits.slice(1);
  } else {
    local = digits;
  }

  if (!/^\d{10}$/.test(local)) return null;
  if (!local.startsWith("7") && !local.startsWith("8") && !local.startsWith("9")) return null;

  const e164 = `+234${local}`;
  return E164_NG.test(e164) ? e164 : null;
}

/** Zod schema for contact phone input (normalises before validating). */
export const phoneNumberSchema = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .transform((value, ctx) => {
    const e164 = toE164Nigerian(value);
    if (e164 === null) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid Nigerian phone number, e.g. 0801 234 5678",
      });
      return z.NEVER;
    }
    return e164;
  });

/** True when the string is already valid E.164 Nigerian format. */
export function isValidE164Nigerian(value: string): boolean {
  return E164_NG.test(value);
}
