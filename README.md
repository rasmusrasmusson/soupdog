# i18n nav keys — merge instructions

Fills the missing nav translation keys so the navigation labels stop falling
back to English in sv / zh / ar. The fallback mechanism (in Sidebar.tsx /
MobileNav.tsx): `t('nav.X')` returns the key path itself when a key is missing,
and the component shows the English fallback. Adding these keys makes them
resolve properly.

## Where the message files live
NOT in `src`. They are at the repo root:
  messages/en.json
  messages/sv.json
  messages/zh.json
  messages/ar.json
(imported in locale-context.tsx as `../../messages/${locale}.json`.)

## What to do
Each `*.nav.json` file here contains ONLY the `nav` object for that locale,
covering EVERY nav key the app references (not just plan/people/usage/pricing —
all of them, so nothing falls back).

For each locale file `messages/<loc>.json`:
1. Open it. It already has a top-level `nav` object (with at least `browse`,
   `recipes`).
2. MERGE the keys from `<loc>.nav.json` into that existing `nav` object — add
   the missing keys, leave any existing ones as they are (your existing
   translations win; these are only meant to fill gaps). Don't replace the
   whole file — it has many other sections besides `nav`.
3. Keep valid JSON (commas between keys, no trailing comma on the last one).

If a locale file has NO `nav` object yet, paste the whole `nav` block from the
snippet in.

## TRANSLATION QUALITY — please check before relying on these
- **en** — canonical, correct.
- **sv** — Swedish, confident. ("Plan" is fine as-is in Swedish; "Personer" for
  People in the household sense; "Användning" for Usage/consumption.)
- **zh** — Simplified Chinese, REASONABLE but please have a native speaker
  confirm, especially: 用量 (usage — used here in the AI-usage/quota sense; if
  it means account usage you may prefer 使用情况), 成员 (people/members) vs 人员.
- **ar** — Modern Standard Arabic, REASONABLE but please have a native speaker
  confirm. RTL is already handled by the app (rtlLocales includes 'ar', dir
  flips). Definite article "ال" prefixing is stylistic; some apps drop it for
  nav brevity (وصفات vs الوصفات) — adjust to taste/consistency with the rest of
  your ar.json.

## Test after merging + deploy
Switch locale (the locale switcher sets a `locale` cookie). The nav labels for
Plan / People / Usage / Pricing — and all others — should now show in the
chosen language instead of English. Verify Arabic also flips to RTL.
