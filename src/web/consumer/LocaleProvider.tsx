import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LOCALE, translate, type Locale } from './locales';
const Context = createContext({ locale: DEFAULT_LOCALE as Locale, setLocale: (_locale: Locale) => {}, t: (text: string) => text });
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const value = useMemo(() => ({ locale, setLocale, t: (text: string) => translate(text, locale) }), [locale]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useLocale() { return useContext(Context); }
