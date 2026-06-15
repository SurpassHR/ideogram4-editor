import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Lang } from './translations';
import { translations, DEFAULT_LANG } from './translations';

const STORAGE_KEY = 'ideogram4-lang';

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (path: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function resolveLang(raw: string | null): Lang {
  if (raw === 'en' || raw === 'zh') return raw;
  return DEFAULT_LANG;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => resolveLang(localStorage.getItem(STORAGE_KEY)));

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback(
    (path: string, vars?: Record<string, string | number>): string => {
      const keys = path.split('.');
      let value: unknown = translations[lang];
      for (const key of keys) {
        if (value == null || typeof value !== 'object') return path;
        value = (value as Record<string, unknown>)[key];
      }
      if (typeof value !== 'string') return path;

      let result = value;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          result = result.replace(`{${k}}`, String(v));
        }
      }
      return result;
    },
    [lang],
  );

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}