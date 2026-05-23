'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import type { Locale } from '@/i18n/config';
import { locales, defaultLocale, isRTL } from '@/i18n/config';

interface LocaleContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  dir: 'ltr' | 'rtl';
  t: (key: string) => string;
  messages: Record<string, any>;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: 'en', setLocale: () => {}, dir: 'ltr', t: (k) => k, messages: {},
});

export function LocaleProvider({ children, initialMessages }: {
  children: React.ReactNode;
  initialMessages: Record<string, any>;
}) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [messages, setMessages] = useState(initialMessages);

  useEffect(() => {
    const saved = document.cookie.match(/locale=([^;]+)/)?.[1] as Locale;
    if (saved && locales.includes(saved)) {
      setLocaleState(saved);
      loadMessages(saved);
    }
  }, []);

  const loadMessages = async (l: Locale) => {
    try {
      const msgs = await import(`../../messages/${l}.json`);
      setMessages(msgs.default);
    } catch {}
  };

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    document.cookie = `locale=${l};path=/;max-age=31536000`;
    loadMessages(l);
    // Update html dir and lang
    document.documentElement.setAttribute('dir', isRTL(l) ? 'rtl' : 'ltr');
    document.documentElement.setAttribute('lang', l);
  };

  const t = (keyPath: string): string => {
    const keys = keyPath.split('.');
    let val: any = messages;
    for (const k of keys) { val = val?.[k]; }
    return typeof val === 'string' ? val : keyPath;
  };

  return (
    <LocaleContext.Provider value={{ locale, setLocale, dir: isRTL(locale) ? 'rtl' : 'ltr', t, messages }}>
      {children}
    </LocaleContext.Provider>
  );
}

export const useLocale = () => useContext(LocaleContext);
