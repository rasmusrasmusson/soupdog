'use client';

// src/app/pricing/page.tsx
// Public pricing page. Works in both layouts (RootShell wraps it): logged-out
// visitors see the marketing shell, logged-in users the app shell.
// AI is never mentioned — tiers are framed by outcome. Ad-free is intentionally
// NOT listed (ads aren't live yet; we add that line when they ship).
// Placeholder prices/limits — to be set from real usage before charging.

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

type Billing = 'monthly' | 'annual';

const ACCENT = 'var(--accent)';
const B = '1px solid var(--border)';

// Annual = ~2 months free (10x monthly).
const PRICES = {
  plus:   { monthly: 8,  annualPerMonth: 7 },   // £80/yr ≈ 6.67/mo, shown rounded
  family: { monthly: 20, annualPerMonth: 17 },  // £200/yr
};

export default function PricingPage() {
  const { user } = useAuth();
  const [billing, setBilling] = useState<Billing>('monthly');

  // No plan storage yet — every signed-in user is treated as Free for now.
  // When the plan column exists, read it here to mark the current tier.
  type Plan = 'free' | 'plus' | 'family';
  const currentPlan = 'free' as Plan;

  const plusPrice   = billing === 'monthly' ? PRICES.plus.monthly   : PRICES.plus.annualPerMonth;
  const familyPrice = billing === 'monthly' ? PRICES.family.monthly : PRICES.family.annualPerMonth;

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '56px 32px 96px' }}>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 36 }}>
        <h1 style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 30, fontWeight: 500, margin: '0 0 8px', color: 'var(--fg)' }}>
          Cook with less friction
        </h1>
        <p style={{ fontSize: 15, color: 'var(--muted)', margin: '0 0 22px' }}>
          Free to start. Upgrade when Soupdog starts planning your week.
        </p>

        {/* Billing toggle */}
        <div style={{ display: 'inline-flex', border: B, borderRadius: 8, overflow: 'hidden' }}>
          <button
            onClick={() => setBilling('monthly')}
            style={toggleStyle(billing === 'monthly')}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling('annual')}
            style={toggleStyle(billing === 'annual')}
          >
            Annual · 2 months free
          </button>
        </div>
      </div>

      {/* Tiers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, alignItems: 'start' }}>

        {/* Free */}
        <Tier
          name="Free"
          tagline="For getting started"
          price="£0"
          priceSuffix=""
          features={[
            ['Browse & save recipes', true],
            ['Add your own recipes', true],
            ['Profile & allergies', true],
            ['A few recipe imports a month', true],
            ['No meal planning', false],
          ]}
          cta={currentPlan === 'free'
            ? { label: 'Your current plan', href: null }
            : { label: 'Switch to Free', href: '/my/usage' }}
          highlighted={false}
        />

        {/* Plus */}
        <Tier
          name="Plus"
          tagline="For everyday cooking"
          price={`£${plusPrice}`}
          priceSuffix="/mo"
          features={[
            ['Everything in Free', true],
            ['Weekly meal planning', true],
            ['Cooking help, any recipe', true],
            ['Generous monthly imports', true],
            ['Scale recipes to any servings', true],
          ]}
          cta={currentPlan === 'plus'
            ? { label: 'Your current plan', href: null }
            : { label: 'Upgrade to Plus', href: user ? '/checkout?plan=plus' : '/signup?plan=plus' }}
          highlighted
          badge="Most popular"
        />

        {/* Family */}
        <Tier
          name="Family"
          tagline="For the whole household"
          price={`£${familyPrice}`}
          priceSuffix="/mo"
          features={[
            ['Everything in Plus', true],
            ['Plan for everyone you cook for', true],
            ['Per-person allergies & needs', true],
            ['Highest monthly limits', true],
            ['Priority support', true],
          ]}
          cta={currentPlan === 'family'
            ? { label: 'Your current plan', href: null }
            : { label: 'Upgrade to Family', href: user ? '/checkout?plan=family' : '/signup?plan=family' }}
          highlighted={false}
        />
      </div>

      <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginTop: 28 }}>
        All plans include unlimited recipe browsing and saving. Cancel anytime.
      </p>
    </div>
  );
}

function Tier({
  name, tagline, price, priceSuffix, features, cta, highlighted, badge,
}: {
  name: string;
  tagline: string;
  price: string;
  priceSuffix: string;
  features: [string, boolean][];
  cta: { label: string; href: string | null };
  highlighted: boolean;
  badge?: string;
}) {
  return (
    <div style={{
      position: 'relative',
      background: 'var(--surface)',
      border: highlighted ? `2px solid ${ACCENT}` : B,
      borderRadius: 12,
      padding: '24px 22px',
    }}>
      {badge && (
        <span style={{
          position: 'absolute', top: -11, left: 22,
          background: ACCENT, color: 'white',
          fontSize: 12, padding: '3px 12px', borderRadius: 7,
          fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.04em',
        }}>
          {badge}
        </span>
      )}

      <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--fg)', marginBottom: 2 }}>{name}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>{tagline}</div>

      <div style={{ fontSize: 30, fontWeight: 500, color: 'var(--fg)', marginBottom: 18 }}>
        {price}
        {priceSuffix && <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 400 }}>{priceSuffix}</span>}
      </div>

      {cta.href === null ? (
        <div style={{ ...ctaBase, background: 'var(--bg)', color: 'var(--muted)', cursor: 'default', textAlign: 'center' }}>
          {cta.label}
        </div>
      ) : (
        <Link
          href={cta.href}
          style={{
            ...ctaBase,
            display: 'block', textAlign: 'center', textDecoration: 'none',
            background: highlighted ? ACCENT : 'var(--surface)',
            color: highlighted ? 'white' : 'var(--fg)',
            border: highlighted ? `1px solid ${ACCENT}` : B,
          }}
        >
          {cta.label}
        </Link>
      )}

      <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 9 }}>
        {features.map(([text, included]) => (
          <div key={text} style={{ fontSize: 13, color: included ? 'var(--fg)' : 'var(--muted)', display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ color: included ? ACCENT : 'var(--muted)', fontSize: 13 }}>{included ? '✓' : '—'}</span>
            <span>{text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function toggleStyle(active: boolean): React.CSSProperties {
  return {
    padding: '7px 16px',
    fontSize: 13,
    border: 'none',
    background: active ? 'var(--bg)' : 'transparent',
    color: active ? 'var(--fg)' : 'var(--muted)',
    cursor: 'pointer',
    fontWeight: active ? 500 : 400,
  };
}

const ctaBase: React.CSSProperties = {
  width: '100%',
  padding: '10px 16px',
  borderRadius: 8,
  fontSize: 14,
  fontWeight: 500,
  boxSizing: 'border-box',
};
