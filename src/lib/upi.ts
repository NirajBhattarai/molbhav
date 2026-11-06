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

/**
 * The link a buyer's UPI app opens to pay `amount` rupees. A scanned merchant QR is kept as it is
 * (its signed fields are what UPI apps check) with only the missing amount and currency added.
 */
export function upiPayLink(payee: UpiPayee, amount: number, note?: string): string {
  const am = amount.toFixed(2);
  if (payee.qr) {
    const query = payee.qr.slice(payee.qr.indexOf("?") + 1);
    const keys = new Set(
      query.split("&").map((kv) => decodeURIComponent(kv.split("=")[0] ?? "").toLowerCase()),
    );
    const add = [...(keys.has("am") ? [] : [`am=${am}`]), ...(keys.has("cu") ? [] : ["cu=INR"])];
    return `upi://pay?${[query, ...add].filter(Boolean).join("&")}`;
  }
  const params = new URLSearchParams({
    pa: payee.vpa,
    ...(payee.name ? { pn: payee.name } : {}),
    am,
    cu: "INR",
  });
  if (note) params.set("tn", note.slice(0, 50));
  return `upi://pay?${params.toString().replace(/\+/g, "%20").replace(/%40/g, "@")}`;
}
