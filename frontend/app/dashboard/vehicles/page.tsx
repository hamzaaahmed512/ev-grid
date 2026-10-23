'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Info, X } from 'lucide-react';
import VehiclesView from '../../../components/VehiclesView';

export default function DashboardVehiclesPage() {
  const [toast, setToast] = useState('');

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast('');
    }, 4000);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pale)', paddingBottom: '4rem' }}>
      {/* Top Header / Breadcrumb Bar */}
      <header
        style={{
          height: 76,
          padding: '0 32px',
          background: '#ffffff',
          borderBottom: '1px solid var(--line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 30,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link
            href="/"
            className="back-link"
            style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowLeft size={16} /> Home
          </Link>
          <span style={{ color: 'var(--line)' }}>|</span>
          <div className="breadcrumb">
            <span className="breadcrumb-workspace">Workspace</span>
            <ChevronRight className="breadcrumb-separator" size={14} />
            <strong>My Vehicles</strong>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main
        style={{
          width: '100%',
          maxWidth: 1400,
          margin: '0 auto',
          padding: '2rem clamp(1.25rem, 3vw, 2.5rem)',
        }}
      >
        <VehiclesView notify={notify} />
      </main>

      {/* Toast Notification */}
      {toast && (
        <div role="status" className="toast">
          <Info size={19} />
          {toast}
          <button onClick={() => setToast('')} aria-label="Dismiss">
            <X size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
