'use client';

import { useState } from 'react';
import { useAuth } from '../lib/auth-context';

export default function GoogleSignIn({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const { googleLogin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (disabled || loading) return;
    setError(null);
    setLoading(true);

    try {
      const err = await googleLogin();
      if (err) setError(err);
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Failed to initiate Google sign-in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="google-sign-in" style={{ width: '100%', marginBottom: '1rem' }}>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        className="btn btn-outline full"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: '12px 16px',
          fontWeight: 600,
          fontSize: '0.875rem',
          background: '#ffffff',
          color: '#1f2937',
          border: '1px solid #d1d5db',
          borderRadius: 8,
          cursor: disabled || loading ? 'not-allowed' : 'pointer',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
          transition: 'background-color 0.15s ease',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path
            d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
            fill="#4285F4"
          />
          <path
            d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.3441 0-4.3282-1.5831-5.0359-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
            fill="#34A853"
          />
          <path
            d="M3.9641 10.71c-.18-.54-.2823-1.1168-.2823-1.71s.1023-1.17.2823-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418l3.0068-2.3318z"
            fill="#FBBC05"
          />
          <path
            d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.9245 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9641 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z"
            fill="#EA4335"
          />
        </svg>
        <span>{loading ? 'Connecting to Google…' : 'Continue with Google'}</span>
      </button>

      {error && (
        <p className="small-note" role="alert" style={{ color: '#dc2626', marginTop: 6 }}>
          {error}
        </p>
      )}

      <div className="auth-divider" style={{ margin: '18px 0' }}>
        <span>or continue with email</span>
      </div>
    </div>
  );
}
