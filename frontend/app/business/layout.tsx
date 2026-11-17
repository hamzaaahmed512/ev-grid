'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import BusinessGuard from '@/components/business/BusinessGuard';
import { useAuth } from '@/lib/auth-context';
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  TrendingUp,
  ArrowLeft,
  Menu,
  X,
  Zap,
  LogOut,
} from 'lucide-react';

interface BusinessLayoutProps {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { label: 'Dashboard', href: '/business', icon: LayoutDashboard },
  { label: 'My Stations', href: '/business/stations', icon: Building2 },
  { label: 'Bookings', href: '/business/bookings', icon: CalendarDays },
  { label: 'Earnings', href: '/business/earnings', icon: TrendingUp },
];

export default function BusinessLayout({ children }: BusinessLayoutProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/business') {
      return pathname === '/business';
    }
    return pathname.startsWith(href);
  };

  return (
    <BusinessGuard>
      <div className="app-shell" style={{ minHeight: '100vh', display: 'flex', background: 'var(--pale)' }}>
        {/* Desktop & Mobile Sidebar */}
        <aside
          className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}
          style={{
            width: 260,
            flexShrink: 0,
            background: 'white',
            borderRight: '1px solid var(--line)',
            display: 'flex',
            flexDirection: 'column',
            position: 'sticky',
            top: 0,
            height: '100vh',
            zIndex: 40,
          }}
        >
          {/* Header / Brand */}
          <div style={{ padding: '22px 20px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Link href="/business" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: '#e8f6ed', color: 'var(--green)', display: 'grid', placeItems: 'center' }}>
                <Zap size={20} />
              </div>
              <div>
                <strong style={{ fontSize: 16, display: 'block', letterSpacing: '-0.03em', color: 'var(--ink)' }}>EV Grid</strong>
                <span className="badge" style={{ padding: '2px 7px', fontSize: 9 }}>BUSINESS</span>
              </div>
            </Link>
            <button
              className="icon-button sidebar-close"
              aria-label="Close navigation"
              onClick={() => setMobileMenuOpen(false)}
              style={{ display: mobileMenuOpen ? 'block' : 'none' }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Navigation Links */}
          <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="nav-label" style={{ padding: '8px 12px', fontSize: 10, fontWeight: 800, color: '#99aaa0', letterSpacing: '0.12em' }}>
              BUSINESS MANAGEMENT
            </div>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`sidebar-link ${active ? 'selected' : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: 'none',
                    background: active ? '#e9f5ed' : 'transparent',
                    color: active ? 'var(--green)' : '#697d70',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  <Icon size={18} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {active && <span className="nav-active-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)' }} />}
                </Link>
              );
            })}
          </nav>

          {/* Bottom links */}
          <div style={{ padding: 16, borderTop: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Link
              href="/"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                color: '#657c6b',
                textDecoration: 'none',
              }}
            >
              <ArrowLeft size={16} />
              <span>Back to Driver Portal</span>
            </Link>
            <button
              onClick={() => logout()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                color: '#c24437',
                border: 'none',
                background: 'transparent',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <LogOut size={16} />
              <span>Sign out</span>
            </button>
          </div>
        </aside>

        {/* Mobile backdrop */}
        {mobileMenuOpen && (
          <div
            onClick={() => setMobileMenuOpen(false)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.4)',
              zIndex: 35,
            }}
          />
        )}

        {/* Main Workspace Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Top Bar */}
          <header
            style={{
              height: 68,
              background: 'white',
              borderBottom: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 28px',
              position: 'sticky',
              top: 0,
              zIndex: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="icon-button"
                aria-label="Open navigation menu"
                style={{ display: 'inline-flex' }}
              >
                <Menu size={20} />
              </button>
              <span style={{ fontSize: 13, color: '#88988e' }}>Business Portal /</span>
              <strong style={{ fontSize: 14, color: 'var(--ink)' }}>
                {NAV_ITEMS.find((n) => isActive(n.href))?.label || 'Overview'}
              </strong>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column' }}>
                <strong style={{ fontSize: 13, color: 'var(--ink)' }}>{user?.name || 'Station Owner'}</strong>
                <small style={{ fontSize: 10, color: 'var(--muted)' }}>Commercial Operator</small>
              </div>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #22a356, #16803c)',
                  color: 'white',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                {user?.name?.slice(0, 2).toUpperCase() || 'BO'}
              </div>
            </div>
          </header>

          {/* Page Content */}
          <main style={{ flex: 1, padding: '32px 32px 64px', maxWidth: 1400, width: '100%', margin: '0 auto' }}>
            {children}
          </main>
        </div>
      </div>
    </BusinessGuard>
  );
}
