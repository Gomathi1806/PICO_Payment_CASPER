'use client';

import React, { useState, use } from 'react';

const ITEMS = [
  { id: 1, title: 'Top 5 Midjourney Prompts', price: '$0.50', description: 'The exact prompts I used for my viral cyberpunk series.', type: 'PDF' },
  { id: 2, title: 'My 10min Morning Routine', price: '$0.25', description: 'The checklist that keeps me productive at 5am.', type: 'Checklist' },
  { id: 3, title: 'Lighting Setup for Reels', price: '$1.00', description: 'A video walkthrough of my 3-point lighting setup.', type: 'Video' },
];

export default function CreatorProfile(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const id = params.id;

  const [unlocked, setUnlocked] = useState<number[]>([]);
  const [loading, setLoading] = useState<number | null>(null);

  const handleUnlock = (id: number) => {
    setLoading(id);
    // Simulate X402 Flow: Challenge -> Payment -> Verification
    setTimeout(() => {
      setUnlocked([...unlocked, id]);
      setLoading(null);
    }, 1500);
  };

  return (
    <div className="animate-fade">
      <header style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{ 
          width: '100px', 
          height: '100px', 
          borderRadius: '50%', 
          background: 'linear-gradient(45deg, #3b82f6, #10b981)',
          margin: '0 auto 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem'
        }}>
          🎨
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>@{id}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          Teaching you how to master generative art. 🚀
        </p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {ITEMS.map((item) => (
          <div key={item.id} className="glass" style={{ padding: '1.5rem', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <span style={{ 
                fontSize: '0.7rem', 
                fontWeight: 'bold', 
                textTransform: 'uppercase', 
                color: 'var(--accent)',
                letterSpacing: '0.1em'
              }}>
                {item.type}
              </span>
              <span style={{ fontWeight: 'bold', color: 'var(--success)' }}>{item.price}</span>
            </div>
            
            <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{item.title}</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
              {item.description}
            </p>

            {unlocked.includes(item.id) ? (
              <div style={{ 
                background: 'rgba(16, 185, 129, 0.1)', 
                color: 'var(--success)', 
                padding: '1rem', 
                borderRadius: '12px',
                textAlign: 'center',
                fontWeight: '600',
                border: '1px solid rgba(16, 185, 129, 0.2)'
              }}>
                ✅ Unlocked: View Content
              </div>
            ) : (
              <button 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '0.8rem' }}
                onClick={() => handleUnlock(item.id)}
                disabled={loading === item.id}
              >
                {loading === item.id ? 'Processing X402...' : 'Unlock with FaceID'}
              </button>
            )}
          </div>
        ))}
      </div>

      <p style={{ textAlign: 'center', marginTop: '3rem', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
        Powered by Pico &bull; No login required
      </p>
    </div>
  );
}
