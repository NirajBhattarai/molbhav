export const LANGS = ["en", "hi", "mr", "ta", "ne", "ja", "ko", "zh", "es", "fr"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG: Record<Lang, { own: string; english: string }> = {
  en: { own: "English", english: "English" },
  hi: { own: "हिन्दी", english: "Hindi" },
  mr: { own: "मराठी", english: "Marathi" },
  ta: { own: "தமிழ்", english: "Tamil" },
  ne: { own: "नेपाली", english: "Nepali" },
  ja: { own: "日本語", english: "Japanese" },
  ko: { own: "한국어", english: "Korean" },
  zh: { own: "中文", english: "Chinese (Simplified)" },
  es: { own: "Español", english: "Spanish" },
  fr: { own: "Français", english: "French" },
};

export const isLang = (v: unknown): v is Lang =>
  typeof v === "string" && (LANGS as readonly string[]).includes(v);
