'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import LegalFooter from '@/components/LegalFooter';
import { signIn } from 'next-auth/react';
import { registerUser, getHomeRouteForUser } from '@/app/actions/auth';
import { getSession } from 'next-auth/react';

// Focused on Creator accounts only for now. Publisher and Agent role
// support still exists in the schema and the role picker code is
// preserved in git history — we're just hiding those options from the
// primary onboarding flow while we prove the creator wedge.
type Role = 'creator';

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [handle, setHandle] = useState('');
  const role: Role = 'creator';
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await registerUser({ email, password, handle, role });

      if (!result.success) {
        setError(result.error || 'Registration failed. Please try again.');
        setLoading(false);
        return;
      }

      const signInResult = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (signInResult?.error) {
        setError('Account created but sign-in failed. Please log in manually.');
      } else {
        // Read the session to learn the user id, then ask the server
        // where this role should land. Keeps the role-routing decision
        // in one server-side place rather than duplicated here.
        const session = await getSession();
        const userId = session?.user?.id;
        const home = userId ? await getHomeRouteForUser(userId) : '/dashboard';
        router.push(home);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', justifyContent: 'center', paddingBottom: '4rem' }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
        <Link href="/" style={{ fontSize: '1.2rem', fontWeight: 800, textDecoration: 'none', color: 'white' }}>
          Pico.
        </Link>
      </nav>

      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 className="text-gradient" style={{ fontSize: '2.5rem', lineHeight: '1.1', fontWeight: 800 }}>
          Pico.
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '0.75rem' }}>
          Create your account and start selling in seconds.
        </p>
      </div>

      <div className="glass" style={{ padding: '2.5rem' }}>
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '12px',
            padding: '0.85rem 1rem',
            marginBottom: '1.5rem',
            color: '#f87171',
            fontSize: '0.85rem',
            textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem', fontWeight: 'bold', letterSpacing: '0.08em' }}>
              EMAIL
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--card-border)',
                padding: '1rem',
                borderRadius: '12px',
                color: 'white',
                fontSize: '1rem',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem', fontWeight: 'bold', letterSpacing: '0.08em' }}>
              YOUR CREATOR HANDLE
            </label>
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--card-border)', borderRadius: '12px', overflow: 'hidden' }}>
              <span style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.9rem', borderRight: '1px solid var(--card-border)', whiteSpace: 'nowrap' }}>
                pico.link/
              </span>
              <input
                type="text"
                placeholder="yourname"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                required
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  padding: '1rem',
                  color: 'white',
                  fontSize: '1rem',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '2rem' }}>
            <label style={{ display: 'block', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '0.5rem', fontWeight: 'bold', letterSpacing: '0.08em' }}>
              PASSWORD
            </label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--card-border)',
                padding: '1rem',
                borderRadius: '12px',
                color: 'white',
                fontSize: '1rem',
                outline: 'none',
              }}
            />
            <p style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '0.4rem' }}>
              Must be at least 6 characters.
            </p>
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading || !email.trim() || !password || !handle.trim()}
            style={{ width: '100%', fontSize: '1rem', padding: '1rem' }}
          >
            {loading ? 'Creating account...' : 'Create Account — It\u0027s Free'}
          </button>
        </form>

        <p style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
            Sign in
          </Link>
        </p>

        <p style={{ marginTop: '1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: '1.5', textAlign: 'center' }}>
          🔒 No wallet required. Fans pay with FaceID — you get paid automatically.
        </p>
      </div>

      <LegalFooter variant="compact" />
    </div>
  );
}
