export const locales = ['en', 'sv', 'zh', 'ar'] as const;
export type Locale = typeof locales[number];
export const defaultLocale: Locale = 'en';
export const rtlLocales: Locale[] = ['ar'];

export function isRTL(locale: Locale) {
  return rtlLocales.includes(locale);
}
