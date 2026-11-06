export const LANGS = ["en", "hi", "mr", "ta", "ne", "ja", "ko", "zh", "es", "fr"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG: Record<Lang, { own: string; english: string; locale: string }> = {
  en: { own: "English", english: "English", locale: "en-IN" },
  hi: { own: "हिन्दी", english: "Hindi", locale: "hi-IN" },
  mr: { own: "मराठी", english: "Marathi", locale: "mr-IN" },
  ta: { own: "தமிழ்", english: "Tamil", locale: "ta-IN" },
  ne: { own: "नेपाली", english: "Nepali", locale: "ne-NP" },
  ja: { own: "日本語", english: "Japanese", locale: "ja-JP" },
  ko: { own: "한국어", english: "Korean", locale: "ko-KR" },
  zh: { own: "中文", english: "Chinese (Simplified)", locale: "zh-CN" },
  es: { own: "Español", english: "Spanish", locale: "es-ES" },
  fr: { own: "Français", english: "French", locale: "fr-FR" },
};

export const isLang = (v: unknown): v is Lang =>
  typeof v === "string" && (LANGS as readonly string[]).includes(v);

/** The language a phone is set to, if it's one of ours: "ja-JP" → "ja". */
export function langOf(locale: string | undefined, fallback: Lang): Lang {
  const code = locale?.slice(0, 2).toLowerCase();
  return isLang(code) ? code : fallback;
}
