'use client';

import React, { useMemo, useState } from 'react';

/**
 * Pico Revenue Calculator — "what are you leaving on the table?"
 *
 * Plug in monthly uniques + average session length, the calculator
 * estimates how many articles each visitor reads, then compares
 * subscription revenue (today's model) against three Pico
 * micropayment scenarios (low / mid / high pay-per-article
 * conversion). The headline shows the gap.
 *
 * Conversion benchmarks are intentionally conservative:
 *  - Subscription conversion: 1.0% (industry average for news sites
 *    that publish a paywall; high end is 3-5% for The Times / FT).
 *  - Micropayment conversion: 5% / 15% / 25% (low / mid / high).
 *    These come from Blendle's 2018 reporting and recent Substack
 *    "tip" experiments — typical range when the price is sub-£1.
 */

const MINUTES_PER_ARTICLE = 3.5;
const SUBSCRIPTION_CONVERSION = 0.01; // 1%
const PICO_SCENARIOS = [
  { label: 'Cautious', conversionRate: 0.05 },
  { label: 'Realistic', conversionRate: 0.15 },
  { label: 'Optimistic', conversionRate: 0.25 },
];

const fmt = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

const fmtCount = (n: number) =>
  n.toLocaleString('en-GB', { maximumFractionDigits: 0 });

export default function RevenueCalculator() {
  const [uniques, setUniques] = useState(50_000);
  const [avgMinutes, setAvgMinutes] = useState(6);
  const [subPrice, setSubPrice] = useState(5);
  const [picoPrice, setPicoPrice] = useState(0.2);

  const numbers = useMemo(() => {
    const articlesPerVisitor = Math.max(1, avgMinutes / MINUTES_PER_ARTICLE);
    const totalArticleReads = uniques * articlesPerVisitor;

    // Subscription revenue — current model
    const subscribers = uniques * SUBSCRIPTION_CONVERSION;
    const subRevenueMonthly = subscribers * subPrice;

    // Pico scenarios — each visitor decides per article, so the
    // conversion rate applies to total article reads, not visitors.
    const scenarios = PICO_SCENARIOS.map((s) => {
      const paidReads = totalArticleReads * s.conversionRate;
      // Net to creator after Pico's 5% under-£10 fee
      const gross = paidReads * picoPrice;
      const net = gross * 0.95;
      return { ...s, paidReads, gross, net };
    });

    const bestPico = scenarios[1].net; // realistic scenario
    const leftOnTable = Math.max(0, bestPico - subRevenueMonthly);
    const liftPct = subRevenueMonthly > 0
      ? Math.round(((bestPico - subRevenueMonthly) / subRevenueMonthly) * 100)
      : null;

    return {
      articlesPerVisitor,
      totalArticleReads,
      subscribers,
      subRevenueMonthly,
      scenarios,
      bestPico,
      leftOnTable,
      liftPct,
    };
  }, [uniques, avgMinutes, subPrice, picoPrice]);

  return (
    <div
      className="glass"
      style={{
        padding: '1.5rem',
        background: 'linear-gradient(135deg, rgba(16,185,129,0.05) 0%, rgba(16,185,129,0.01) 100%)',
        border: '1px solid rgba(16,185,129,0.25)',
        marginBottom: '2rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <h3 style={{ fontSize: '1.15rem', margin: 0 }}>💰 What are you leaving on the table?</h3>
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
          ~{MINUTES_PER_ARTICLE} min/article assumption
        </span>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
        99% of your readers will never subscribe. Pico turns those visits into per-article revenue. Plug your numbers in to see the gap.
      </p>

      {/* Inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <Field
          label="Monthly visitors"
          value={uniques}
          onChange={setUniques}
          min={100}
          max={50_000_000}
          step={1_000}
        />
        <Field
          label="Avg time on site (min)"
          value={avgMinutes}
          onChange={setAvgMinutes}
          min={1}
          max={60}
          step={1}
        />
        <Field
          label="Today's sub price (£/mo)"
          symbol="£"
          value={subPrice}
          onChange={setSubPrice}
          min={1}
          max={50}
          step={1}
        />
        <Field
          label="Pico per-article (£)"
          symbol="£"
          value={picoPrice}
          onChange={setPicoPrice}
          min={0.05}
          max={5}
          step={0.05}
        />
      </div>

      {/* Derived stat bar */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--card-border)',
        borderRadius: '10px',
        padding: '0.75rem 1rem',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
        marginBottom: '1rem',
      }}>
        At {avgMinutes} min/visit, the average reader views <b style={{ color: 'white' }}>~{numbers.articlesPerVisitor.toFixed(1)} articles</b>.
        That&apos;s <b style={{ color: 'white' }}>{fmtCount(numbers.totalArticleReads)}</b> article reads/month — currently unmonetised for {fmtCount(uniques - numbers.subscribers)} non-subscribing readers.
      </div>

      {/* Comparison table */}
      <div style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--card-border)',
        borderRadius: '12px',
        padding: '0.75rem 1rem',
        marginBottom: '1rem',
        overflowX: 'auto',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)', fontSize: '0.65rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              <th style={{ textAlign: 'left', padding: '0.4rem 0.25rem' }}>Model</th>
              <th style={{ textAlign: 'right', padding: '0.4rem 0.25rem' }}>Paying readers / reads</th>
              <th style={{ textAlign: 'right', padding: '0.4rem 0.25rem' }}>Monthly net</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: '1px solid var(--card-border)' }}>
              <td style={{ padding: '0.6rem 0.25rem' }}>
                Subscription only (today)
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>
                  @ {Math.round(SUBSCRIPTION_CONVERSION * 100 * 10) / 10}% conversion
                </span>
              </td>
              <td style={{ padding: '0.6rem 0.25rem', textAlign: 'right' }}>
                {fmtCount(numbers.subscribers)} subscribers
              </td>
              <td style={{ padding: '0.6rem 0.25rem', textAlign: 'right', fontWeight: 600 }}>
                {fmt(numbers.subRevenueMonthly)}
              </td>
            </tr>
            {numbers.scenarios.map((s, idx) => {
              const isMid = idx === 1; // highlight "Realistic"
              return (
                <tr key={s.label} style={{ borderTop: '1px solid var(--card-border)' }}>
                  <td style={{
                    padding: '0.6rem 0.25rem',
                    fontWeight: isMid ? 700 : 400,
                    color: isMid ? 'var(--success)' : 'inherit',
                  }}>
                    Pico micropayments — <b>{s.label}</b>
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block', fontWeight: 400 }}>
                      @ {Math.round(s.conversionRate * 100)}% of article reads paid
                    </span>
                  </td>
                  <td style={{ padding: '0.6rem 0.25rem', textAlign: 'right' }}>
                    {fmtCount(s.paidReads)} reads
                  </td>
                  <td style={{
                    padding: '0.6rem 0.25rem',
                    textAlign: 'right',
                    fontWeight: isMid ? 700 : 600,
                    color: isMid ? 'var(--success)' : 'inherit',
                  }}>
                    {fmt(s.net)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Headline result */}
      <div style={{
        background: 'rgba(16, 185, 129, 0.08)',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        borderRadius: '12px',
        padding: '1rem 1.25rem',
        marginBottom: '0.75rem',
      }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600, marginBottom: '0.35rem', letterSpacing: '0.04em' }}>
          REVENUE LEFT ON THE TABLE
        </div>
        <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--success)', lineHeight: 1.2 }}>
          {fmt(numbers.leftOnTable)}<span style={{ fontSize: '0.85rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.4rem' }}>/ month</span>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
          {numbers.liftPct !== null && numbers.liftPct > 0 ? (
            <>That&apos;s <b style={{ color: 'white' }}>+{numbers.liftPct}%</b> on top of your current subscription revenue, or <b style={{ color: 'white' }}>{fmt(numbers.leftOnTable * 12)}</b>/year.</>
          ) : (
            <>Pico revenue would <b>match or fall short</b> of your subscription model at these inputs — your audience is unusually subscription-friendly.</>
          )}
        </div>
      </div>

      <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
        Conversion benchmarks: 1% subscription (UK news industry average), 5–25% micropayment (Blendle 2018 + Substack tip experiments). Article length assumed at ~{MINUTES_PER_ARTICLE} minutes per piece. Real conversion varies by topic, audience trust, and how prominent the paywall placement is.
      </p>
    </div>
  );
}

function Field({
  label, symbol, value, onChange, min, max, step,
}: {
  label: string; symbol?: string; value: number; onChange: (n: number) => void;
  min: number; max: number; step: number;
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--text-muted)', marginBottom: '0.3rem', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ position: 'relative' }}>
        {symbol && (
          <span style={{
            position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-muted)', fontSize: '0.85rem',
          }}>{symbol}</span>
        )}
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
          }}
          min={min}
          max={max}
          step={step}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--card-border)',
            padding: symbol ? '0.65rem 0.75rem 0.65rem 1.7rem' : '0.65rem 0.75rem',
            borderRadius: '10px',
            color: 'white',
            fontSize: '0.9rem',
            outline: 'none',
          }}
        />
      </div>
    </label>
  );
}
