/**
 * The identity of a menu item within one stall: "Masala Chai", "masala chai" and "Masala-chai."
 * are the same dish. Sizes and quantities stay part of it ("Samosa (2 pcs)" ≠ "Samosa"),
 * because they change the price.
 */
export function menuKey(name: string) {
  return (
    name
      .normalize("NFKD")
      // Latin accents only (é → e). Indic vowel signs are marks too, and they change the word.
      .replace(/[\u0300-\u036f]/g, "")
      .normalize("NFC")
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
      .trim()
  );
}
