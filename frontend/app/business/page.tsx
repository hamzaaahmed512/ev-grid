'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ownerApi,
  OwnerDashboardResponse,
  OwnerApiError,
} from '@/lib/api/owner';
import {
  Building2,
  PlugZap,
  CalendarCheck,
  TrendingUp,
  AlertCircle,
  Clock,
  ArrowRight,
  BatteryCharging,
  Zap,
} from 'lucide-react';

export default function BusinessDashboardPage() {
  const [data, setData] = useState<OwnerDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const res = await ownerApi.getDashboard();
      setData(res);
    } catch (err: any) {
      if (err instanceof OwnerApiError) {
        setError(err.message);
      } else {
        setError('Failed to load dashboard metrics. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div>
        <div className="section-title">
          <div>
            <div className="eyebrow">COMMERCIAL OPERATIONS</div>
            <h2>Business Overview</h2>
            <p>Loading real-time station metrics and reservations…</p>
          </div>
        </div>

        {/* Skeleton Grid */}
        <div className="stats-grid" style={{ marginBottom: 24 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card padded" style={{ height: 130, background: '#f5f8f6', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>

        <div className="two-grid">
          <div className="card padded" style={{ height: 320, background: '#f5f8f6' }} />
          <div className="card padded" style={{ height: 320, background: '#f5f8f6' }} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card padded" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <AlertCircle size={40} color="#dc2626" style={{ margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: 20, marginBottom: 8 }}>Unable to load dashboard</h3>
        <p style={{ color: 'var(--muted)', marginBottom: 20 }}>{error || 'Something went wrong while fetching data.'}</p>
        <button onClick={loadDashboard} className="btn btn-primary">
          Retry
        </button>
      </div>
    );
  }

  const formatPKR = (amt: number) => `Rs ${Math.round(amt).toLocaleString()}`;

  return (
    <div>
      {/* Title Header */}
      <div className="section-title">
        <div>
          <div className="eyebrow">COMMERCIAL OPERATIONS</div>
          <h2>Business Overview</h2>
          <p>Real-time network health, reservations, and estimated revenue.</p>
        </div>
        <div className="inline-actions">
          <Link href="/business/stations/new" className="btn btn-primary">
            <Zap size={16} /> Add Station
          </Link>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="stats-grid" style={{ marginBottom: 28 }}>
        <div className="card padded stat">
          <div className="stat-top">
            <span>ACTIVE STATIONS</span>
            <div className="icon-tile">
              <Building2 size={20} />
            </div>
          </div>
          <strong>{data.total_stations}</strong>
          <small>Commercial charging hubs</small>
        </div>

        <div className="card padded stat">
          <div className="stat-top">
            <span>ACTIVE PLUGS</span>
            <div className="icon-tile">
              <PlugZap size={20} />
            </div>
          </div>
          <strong>{data.total_connectors}</strong>
          <small>Across all your stations</small>
        </div>

        <div className="card padded stat">
          <div className="stat-top">
            <span>TODAY'S BOOKINGS</span>
            <div className="icon-tile">
              <CalendarCheck size={20} />
            </div>
          </div>
          <strong>{data.today_bookings_count}</strong>
          <small>Scheduled for today</small>
        </div>

        <div className="card padded stat">
          <div className="stat-top">
            <span>EST. REVENUE (MONTH)</span>
            <div className="icon-tile">
              <TrendingUp size={20} />
            </div>
          </div>
          <strong>{formatPKR(data.estimated_revenue_this_month)}</strong>
          <small>vs {formatPKR(data.estimated_revenue_last_month)} last month</small>
        </div>
      </div>

      {/* Two Column Grid */}
      <div className="two-grid" style={{ marginBottom: 28 }}>
        {/* Connector Status Summary */}
        <div className="card padded">
          <div className="section-title" style={{ marginBottom: 18 }}>
            <div>
              <h3 style={{ fontSize: 18, marginBottom: 4 }}>Connectors by Status</h3>
              <p>Operational health across all active charging bays.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12 }}>
            <div style={{ padding: 14, background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0', textAlign: 'center' }}>
              <span className="badge" style={{ marginBottom: 8 }}>AVAILABLE</span>
              <strong style={{ display: 'block', fontSize: 24, color: '#166534' }}>
                {data.connectors_by_status.AVAILABLE || 0}
              </strong>
            </div>

            <div style={{ padding: 14, background: '#eff6ff', borderRadius: 12, border: '1px solid #bfdbfe', textAlign: 'center' }}>
              <span className="badge blue" style={{ marginBottom: 8 }}>CHARGING</span>
              <strong style={{ display: 'block', fontSize: 24, color: '#1e40af' }}>
                {data.connectors_by_status.CHARGING || 0}
              </strong>
            </div>

            <div style={{ padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <span className="badge gray" style={{ marginBottom: 8 }}>OFFLINE</span>
              <strong style={{ display: 'block', fontSize: 24, color: '#475569' }}>
                {data.connectors_by_status.OFFLINE || 0}
              </strong>
            </div>

            <div style={{ padding: 14, background: '#fef2f2', borderRadius: 12, border: '1px solid #fecaca', textAlign: 'center' }}>
              <span className="badge red" style={{ marginBottom: 8 }}>FAULT</span>
              <strong style={{ display: 'block', fontSize: 24, color: '#991b1b' }}>
                {data.connectors_by_status.FAULT || 0}
              </strong>
            </div>

            <div style={{ padding: 14, background: '#fffbeb', borderRadius: 12, border: '1px solid #fde68a', textAlign: 'center' }}>
              <span className="badge amber" style={{ marginBottom: 8 }}>DISABLED</span>
              <strong style={{ display: 'block', fontSize: 24, color: '#92400e' }}>
                {data.connectors_by_status.DISABLED || 0}
              </strong>
            </div>
          </div>
        </div>

        {/* 7-Day Station Utilization */}
        <div className="card padded">
          <div className="section-title" style={{ marginBottom: 18 }}>
            <div>
              <h3 style={{ fontSize: 18, marginBottom: 4 }}>7-Day Station Utilization</h3>
              <p>Booked hours divided by operating hours.</p>
            </div>
          </div>

          {data.utilization_last_7_days.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px 10px' }}>
              <BatteryCharging size={28} />
              <p style={{ marginTop: 10, fontSize: 13 }}>No stations created yet.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {data.utilization_last_7_days.map((u) => (
                <div key={u.station_id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <strong style={{ color: 'var(--ink)' }}>{u.station_name}</strong>
                    <span style={{ color: 'var(--muted)' }}>
                      {u.booked_hours}h / {u.open_hours}h ({u.utilization_percent}%)
                    </span>
                  </div>
                  <div style={{ height: 8, background: '#e9edea', borderRadius: 6, overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(100, Math.max(0, u.utilization_percent))}%`,
                        background: u.utilization_percent > 75 ? '#16803c' : u.utilization_percent > 30 ? '#22a356' : '#94a3b8',
                        borderRadius: 6,
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upcoming Bookings */}
      <div className="card padded">
        <div className="section-title" style={{ marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 18, marginBottom: 4 }}>Upcoming Reservations</h3>
            <p>Next confirmed bookings at your stations.</p>
          </div>
          <Link href="/business/bookings" className="link-button">
            View all bookings <ArrowRight size={14} />
          </Link>
        </div>

        {data.upcoming_bookings.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px 10px' }}>
            <Clock size={32} />
            <h3 style={{ fontSize: 16 }}>No upcoming bookings</h3>
            <p style={{ fontSize: 12 }}>New driver reservations will show up here automatically.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Booking ID</th>
                  <th>Station</th>
                  <th>Connector</th>
                  <th>Driver</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.upcoming_bookings.map((b) => (
                  <tr key={b.booking_id}>
                    <td className="bold-cell">#{b.booking_id}</td>
                    <td>{b.station_name}</td>
                    <td>{b.connector_label}</td>
                    <td>{b.driver_name}</td>
                    <td>{new Date(b.start_time).toLocaleString()}</td>
                    <td>{new Date(b.end_time).toLocaleString()}</td>
                    <td>
                      <span className="badge">{b.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
