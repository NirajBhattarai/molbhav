const VPA = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

export const isVpa = (value: string) => VPA.test(value.trim());

export type UpiPayee = { vpa: string; name?: string; qr?: string };

/** A scanned QR or a typed UPI ID → who gets paid, or an error message to show. */
export function parseUpi(input: string): UpiPayee | { error: string } {
  const text = input.trim();
  if (isVpa(text)) return { vpa: text.toLowerCase() };

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return {
      error: "That isn’t a UPI QR. Scan the QR you take payments with, or type your UPI ID.",
    };
  }
  if (url.protocol.toLowerCase() !== "upi:" || url.hostname.toLowerCase() !== "pay") {
    return { error: "That QR isn’t a UPI payment QR. Scan the one you take payments with." };
  }
  const vpa = url.searchParams.get("pa")?.trim() ?? "";
  if (!isVpa(vpa)) return { error: "That QR has no valid UPI ID in it. Type your UPI ID instead." };
  const currency = url.searchParams.get("cu");
  if (currency && currency.toUpperCase() !== "INR")
    return { error: "That QR isn’t for Indian rupees." };
  const name = url.searchParams.get("pn")?.trim();
  return { vpa: vpa.toLowerCase(), name: name || undefined, qr: text };
}
