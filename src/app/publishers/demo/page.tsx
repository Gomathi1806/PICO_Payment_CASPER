import Link from 'next/link';
import DemoPaywall from './DemoPaywall';

export const metadata = {
  title: 'Pico Demo — A reader-supported paywall on a live article',
  description:
    'Experience the Pico editorial paywall on a sample article. Click to unlock, see the flow end-to-end, then sign up to install it on your own publication.',
};

// Sample article content modelled after a feature in a UK regional
// newspaper — long enough that the paywall break feels real, short
// enough that the demo loads fast. Two sections: the free preview
// readers always see, and the paywalled body that the demo unlocks.
const ARTICLE_TITLE = 'Why the local pub closed last Tuesday — and why we all lost more than a pint';
const ARTICLE_BYLINE = 'Eleanor Marsh · Reporter, The Daily Ledger · 25 June 2026';

const PREVIEW_PARAGRAPHS = [
  'The Crown and Cushion served its last pint on Tuesday after 174 years on Stationer\'s Row. For most of those years it was where the town met itself — for elections, for funerals, for arguments about the football. Last week, quietly, it became a Tesco Express.',
  'I sat at the bar with John, the publican who took over from his father in 1998, on the morning the brewery told him to close. He was crying, but he was also angry — and not at the brewery.',
];

const GATED_PARAGRAPHS = [
  '"They didn\'t kill us," he said. "We were dying for ten years. The brewery just signed the papers." What killed the pub, John explained, was the slow erosion of community itself — and a parking restriction the council introduced in 2019 that nobody fought against because the meetings were buried in a PDF agenda that nobody read.',
  'This is the third pub on this street to close in eighteen months. Across the borough, twenty-two have shut since 2020. The pattern is consistent: not financial collapse, but slow strangulation by a thousand small decisions made in rooms that the public stopped attending. Local journalism used to be the alarm system for that. It mostly isn\'t any more.',
  'I went to the council meeting where the 2019 parking change was approved. The room was empty except for a planning officer, three councillors, and me. The motion passed in four minutes. The next morning the Crown lost half its evening trade — drivers couldn\'t stop, the regulars from the surrounding villages couldn\'t come in. John told me the brewery saw the takings drop and started the clock five years before he knew it was running.',
  'This is the story I want to tell more of. It costs me, a freelance reporter, about £180 in time to attend a single council meeting, file freedom-of-information requests, and verify what was said against the planning record. A subscription model never works for this kind of work — readers want one piece, not a relationship. A donations page collects perhaps £40 a year. The maths has never added up.',
  'Until, perhaps, now. The article you\'re reading was unlocked for 20p via Pico. If 800 of you do the same, I can cover the next council meeting. If 8,000 do, I can pay another reporter to cover the neighbouring borough. None of you have to subscribe. None of you have to remember a password. You read a story, you paid for the story, you go on with your day. The pub is gone. The reporting needn\'t be.',
];

export default function PublishersDemoPage() {
  return (
    <div
      style={{
        background: '#f8f5ee',
        color: '#0b0b0d',
        minHeight: '100vh',
        margin: '-2rem',
        padding: '2rem',
        fontFamily: 'Georgia, "Times New Roman", serif',
      }}
    >
      {/* Demo banner — clearly marks this as a demo, not a real subscription */}
      <div
        style={{
          background: '#fbbf24',
          color: '#451a03',
          padding: '0.6rem 1rem',
          borderRadius: '2px',
          fontFamily: '-apple-system, sans-serif',
          fontSize: '0.78rem',
          fontWeight: 600,
          marginBottom: '2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <span>📰 This is a demo article — no real payment will be taken.</span>
        <Link href="/publishers/print" style={{ color: '#451a03', textDecoration: 'underline' }}>
          ← Back to publisher info
        </Link>
      </div>

      {/* Masthead */}
      <header
        style={{
          textAlign: 'center',
          borderBottom: '2px solid #1f2937',
          paddingBottom: '0.75rem',
          marginBottom: '2rem',
        }}
      >
        <div
          style={{
            fontFamily: '-apple-system, sans-serif',
            fontSize: '0.7rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#6b7280',
            fontWeight: 600,
            marginBottom: '0.3rem',
          }}
        >
          The Daily Ledger
        </div>
        <div
          style={{
            fontFamily: '-apple-system, sans-serif',
            fontSize: '0.7rem',
            color: '#6b7280',
          }}
        >
          Independent journalism · founded 2019 · powered by readers
        </div>
      </header>

      {/* Article */}
      <article style={{ maxWidth: '660px', margin: '0 auto', padding: '0 0.5rem' }}>
        <h1
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: '2.4rem',
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: '-0.015em',
            margin: '1rem 0 1rem',
            color: '#0b0b0d',
          }}
        >
          {ARTICLE_TITLE}
        </h1>
        <p
          style={{
            fontFamily: '-apple-system, sans-serif',
            fontSize: '0.78rem',
            color: '#6b7280',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            margin: '0 0 2rem',
          }}
        >
          {ARTICLE_BYLINE}
        </p>

        {/* Free preview */}
        <div style={{ fontSize: '1.1rem', lineHeight: 1.65, color: '#1f2937' }}>
          {PREVIEW_PARAGRAPHS.map((p, i) => (
            <p
              key={i}
              style={{
                margin: '0 0 1.3rem',
                ...(i === 0 ? { fontSize: '1.18rem', fontWeight: 500 } : {}),
              }}
            >
              {p}
            </p>
          ))}
        </div>

        {/* Paywall + gated body — handled by client component so the demo
            unlock button can reveal the rest without a real payment. */}
        <DemoPaywall gatedParagraphs={GATED_PARAGRAPHS} />
      </article>

      {/* Conversion footer */}
      <section
        style={{
          maxWidth: '660px',
          margin: '4rem auto 0',
          padding: '2rem',
          borderTop: '1px solid #1f2937',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: '-apple-system, sans-serif',
            fontSize: '0.7rem',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#6b7280',
            fontWeight: 600,
            marginBottom: '0.5rem',
          }}
        >
          Like what you just experienced?
        </div>
        <h2
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: '1.75rem',
            fontWeight: 700,
            margin: '0 0 1rem',
            color: '#0b0b0d',
          }}
        >
          Install Pico on your own articles in five minutes.
        </h2>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link
            href="/signup"
            style={{
              display: 'inline-block',
              background: '#0b0b0d',
              color: '#f8f5ee',
              fontFamily: '-apple-system, sans-serif',
              fontSize: '0.9rem',
              fontWeight: 600,
              padding: '0.85rem 1.75rem',
              borderRadius: '2px',
              textDecoration: 'none',
            }}
          >
            Create a free publisher account →
          </Link>
          <Link
            href="/publishers/print"
            style={{
              display: 'inline-block',
              border: '1px solid #0b0b0d',
              color: '#0b0b0d',
              fontFamily: '-apple-system, sans-serif',
              fontSize: '0.9rem',
              fontWeight: 600,
              padding: '0.85rem 1.75rem',
              borderRadius: '2px',
              textDecoration: 'none',
            }}
          >
            Read the pitch
          </Link>
        </div>
      </section>
    </div>
  );
}
