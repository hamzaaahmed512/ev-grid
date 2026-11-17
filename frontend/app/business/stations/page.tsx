'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ownerApi,
  OwnerStation,
  OwnerApiError,
} from '@/lib/api/owner';
import {
  Building2,
  Plus,
  Edit,
  Trash2,
  AlertCircle,
  MapPin,
  Clock,
  Zap,
} from 'lucide-react';

export default function BusinessStationsPage() {
  const [stations, setStations] = useState<OwnerStation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  async function loadStations(p = 1) {
    setLoading(true);
    setError(null);
    setActionError(null);
    try {
      const res = await ownerApi.getStations(p, 20);
      setStations(res.items || []);
      setTotal(res.total || 0);
      setPage(res.page || 1);
    } catch (err: any) {
      if (err instanceof OwnerApiError) {
        setError(err.message);
      } else {
        setError('Failed to load stations.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStations(1);
  }, []);

  async function handleDelete(station: OwnerStation) {
    const confirmMsg = `Are you sure you want to deactivate station "${station.name}"? This action soft-deletes the station.`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingId(station.id);
    setActionError(null);
    try {
      await ownerApi.deleteStation(station.id);
      loadStations(page);
    } catch (err: any) {
      if (err instanceof OwnerApiError) {
        setActionError(err.message);
      } else {
        setActionError('Failed to delete station. Please try again.');
      }
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      {/* Title Header */}
      <div className="section-title">
        <div>
          <div className="eyebrow">CHARGING INFRASTRUCTURE</div>
          <h2>My Stations</h2>
          <p>Manage your commercial charging locations and connector configurations.</p>
        </div>
        <div className="inline-actions">
          <Link href="/business/stations/new" className="btn btn-primary">
            <Plus size={16} /> Add Station
          </Link>
        </div>
      </div>

      {/* Action Error Banner (e.g. 409 conflict) */}
      {actionError && (
        <div
          role="alert"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            borderRadius: 12,
            padding: '14px 18px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 13,
          }}
        >
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>Cannot delete station:</strong> {actionError}
          </div>
        </div>
      )}

      {loading ? (
        <div className="station-grid three">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card padded" style={{ height: 220, background: '#f5f8f6' }} />
          ))}
        </div>
      ) : error ? (
        <div className="card padded" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <AlertCircle size={40} color="#dc2626" style={{ margin: '0 auto 16px' }} />
          <h3 style={{ fontSize: 20, marginBottom: 8 }}>Failed to load stations</h3>
          <p style={{ color: 'var(--muted)', marginBottom: 20 }}>{error}</p>
          <button onClick={() => loadStations(1)} className="btn btn-primary">
            Retry
          </button>
        </div>
      ) : stations.length === 0 ? (
        <div className="card empty-state" style={{ padding: '70px 20px' }}>
          <Building2 size={44} style={{ color: '#a0b4a7', marginBottom: 16 }} />
          <h3 style={{ fontSize: 20, marginBottom: 6 }}>No stations yet</h3>
          <p style={{ color: 'var(--muted)', maxWidth: 420, margin: '0 auto 24px', fontSize: 13 }}>
            You haven't added any charging stations to your account yet. Register your first location to start accepting bookings.
          </p>
          <Link href="/business/stations/new" className="btn btn-primary">
            <Plus size={16} /> Create First Station
          </Link>
        </div>
      ) : (
        <>
          <div className="station-grid three">
            {stations.map((st) => (
              <div key={st.id} className="card manager-card" style={{ display: 'flex', flexDirection: 'column' }}>
                <div className="manager-top">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="selected-icon">
                      <Zap size={20} />
                    </span>
                    <span className="badge" style={{ fontSize: 9 }}>{st.type || 'B2P'}</span>
                  </div>
                  <span className={`badge ${st.is_active ? 'green' : 'gray'}`}>
                    {st.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <h3 style={{ fontSize: 17, marginBottom: 6 }}>
                  <Link href={`/business/stations/${st.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    {st.name}
                  </Link>
                </h3>

                <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 14 }}>
                  <MapPin size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>{st.address || 'Address not specified'}{st.city ? `, ${st.city}` : ''}</span>
                </p>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #f0f4f1', paddingTop: 12, marginBottom: 16, fontSize: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--muted)' }}>Connectors</span>
                    <strong style={{ color: 'var(--ink)' }}>{st.connector_count ?? 0} active</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--muted)' }}>Default Tariff</span>
                    <strong style={{ color: 'var(--ink)' }}>
                      {st.price_per_kwh != null ? `Rs ${st.price_per_kwh}/kWh` : 'Not set'}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--muted)' }}>Hours</span>
                    <span style={{ color: 'var(--ink)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} />
                      {st.open_time && st.close_time ? `${st.open_time.slice(0, 5)} - ${st.close_time.slice(0, 5)}` : '24 Hours'}
                    </span>
                  </div>
                </div>

                <div className="manager-actions">
                  <Link href={`/business/stations/${st.id}`} className="btn btn-primary btn-sm" style={{ flex: 2 }}>
                    Manage Plugs
                  </Link>
                  <Link href={`/business/stations/${st.id}/edit`} className="btn btn-light btn-sm" title="Edit station details">
                    <Edit size={14} />
                  </Link>
                  <button
                    onClick={() => handleDelete(st)}
                    disabled={deletingId === st.id}
                    className="btn btn-light btn-sm"
                    style={{ color: '#dc2626' }}
                    title="Delete station"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Simple pagination */}
          {total > 20 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, fontSize: 13, color: 'var(--muted)' }}>
              <span>Showing {stations.length} of {total} stations</span>
              <div className="inline-actions">
                <button
                  disabled={page <= 1}
                  onClick={() => loadStations(page - 1)}
                  className="btn btn-light btn-sm"
                >
                  Previous
                </button>
                <span>Page {page}</span>
                <button
                  disabled={stations.length < 20}
                  onClick={() => loadStations(page + 1)}
                  className="btn btn-light btn-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
