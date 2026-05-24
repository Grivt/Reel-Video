import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { zh } from "./locales/zh";
import { en } from "./locales/en";

export type Lang = "zh" | "en";

const STORAGE_KEY = "reel-lang";

function detectInitialLang(): Lang {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === "zh" || saved === "en") return saved;
  const nav = navigator.language?.toLowerCase() ?? "";
  return nav.startsWith("zh") ? "zh" : "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: detectInitialLang(),
  fallbackLng: "zh",
  interpolation: { escapeValue: false },
});

/** Change language and persist the choice across launches. */
export function setLanguage(lang: Lang) {
  localStorage.setItem(STORAGE_KEY, lang);
  void i18n.changeLanguage(lang);
}

export default i18n;
