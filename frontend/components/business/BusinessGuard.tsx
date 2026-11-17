'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { ownerApi, BackendUser } from '@/lib/api/owner';
import { ShieldAlert, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface BusinessGuardProps {
  children: React.ReactNode;
}

export default function BusinessGuard({ children }: BusinessGuardProps) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [backendUser, setBackendUser] = useState<BackendUser | null>(null);
  const [roleChecking, setRoleChecking] = useState<boolean>(true);
  const [accessDenied, setAccessDenied] = useState<boolean>(false);

  useEffect(() => {
    let active = true;

    async function checkRole() {
      if (authLoading) return;

      if (!user) {
        // Not authenticated -> redirect to sign in
        router.push('/?mode=auth&authPage=Login');
        return;
      }

      // Check backend role directly from /auth/me
      try {
        const me = await ownerApi.getMe();
        if (!active) return;
        setBackendUser(me);

        const realRole = (me.role || '').trim().toLowerCase();
        if (realRole === 'business_owner') {
          setAccessDenied(false);
        } else {
          setAccessDenied(true);
        }
      } catch (err: any) {
        if (!active) return;
        // Fallback: check metadata role on user object
        const metaRole = (user.role || '').trim().toLowerCase();
        if (metaRole === 'business_owner') {
          setAccessDenied(false);
        } else {
          setAccessDenied(true);
        }
      } finally {
        if (active) {
          setRoleChecking(false);
        }
      }
    }

    checkRole();

    return () => {
      active = false;
    };
  }, [user, authLoading, router]);

  if (authLoading || roleChecking) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <Loader2 size={36} className="animate-spin text-green-700" style={{ color: 'var(--green)' }} />
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Verifying business permissions…</p>
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'grid', placeItems: 'center', marginBottom: 20 }}>
          <ShieldAlert size={32} />
        </div>
        <div className="eyebrow" style={{ color: '#dc2626' }}>Access Restricted</div>
        <h1 style={{ fontSize: 28, marginBottom: 12 }}>Business Owner Access Required</h1>
        <p style={{ color: 'var(--muted)', maxWidth: 480, lineHeight: 1.6, marginBottom: 24 }}>
          This portal is reserved for registered EV station operators and business owners. Your account currently holds the <strong>{backendUser?.role || user?.role || 'driver'}</strong> role.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link href="/" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <ArrowLeft size={16} /> Return to Driver Portal
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
