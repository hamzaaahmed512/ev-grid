'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  ownerApi,
  OwnerStation,
  OwnerEarningsResponse,
  OwnerApiError,
} from '@/lib/api/owner';
import {
  TrendingUp,
  Zap,
  CalendarCheck,
  Building2,
  Calendar,
  Filter,
  RefreshCw,
  AlertCircle,
  Info,
  DollarSign,
  BarChart3,
  Layers,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

export default function BusinessEarningsPage() {
  const [mounted, setMounted] = useState(false);

  // Filter States
  const todayStr = new Date().toISOString().split('T')[0];
  const thirtyDaysAgoStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const [dateFrom, setDateFrom] = useState(thirtyDaysAgoStr);
  const [dateTo, setDateTo] = useState(todayStr);
  const [groupBy, setGroupBy] = useState<'day' | 'month'>('day');
  const [selectedStationId, setSelectedStationId] = useState<string>('');
  const [stations, setStations] = useState<OwnerStation[]>([]);

  // Chart metric switch: 'revenue' | 'energy'
  const [chartMetric, setChartMetric] = useState<'revenue' | 'energy'>('revenue');

  // Data & Request States
  const [data, setData] = useState<OwnerEarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load stations list for dropdown
  useEffect(() => {
    async function loadStations() {
      try {
        const res = await ownerApi.listStations({ page: 1, page_size: 100 });
        setStations(res.items || []);
      } catch (err) {
        // Dropdown station error handled gracefully
      }
    }
    loadStations();
  }, []);

  // Fetch earnings
  const fetchEarnings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await ownerApi.getEarnings({
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        group_by: groupBy,
        station_id: selectedStationId ? Number(selectedStationId) : undefined,
      });
      setData(res);
    } catch (err: any) {
      if (err instanceof OwnerApiError) {
        setError(err.message);
      } else {
        setError('Failed to fetch earnings analysis. Please retry.');
      }
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, groupBy, selectedStationId]);

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  // Quick Preset Helper
  function applyPreset(days: number) {
    const end = new Date().toISOString().split('T')[0];
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    setDateFrom(start);
    setDateTo(end);
    if (days > 60) {
      setGroupBy('month');
    } else {
      setGroupBy('day');
    }
  }

  const formatPKR = (amt: number) => `Rs ${Math.round(amt).toLocaleString()}`;
  const formatKWh = (kwh: number) => `${Math.round(kwh).toLocaleString()} kWh`;

  const totalRev = data?.totals?.estimated_revenue ?? data?.estimated_revenue ?? 0;
  const totalEnergy = data?.totals?.estimated_energy_kwh ?? data?.estimated_energy_kwh ?? 0;
  const totalCompleted = data?.totals?.completed_bookings ?? data?.completed_bookings ?? 0;

  // Chart Data preparation
  const chartData = useMemo(() => {
    if (!data?.time_series) return [];
    return data.time_series.map((pt) => ({
      date: pt.date,
      revenue: Math.round(pt.estimated_revenue),
      energy: Math.round(pt.estimated_energy_kwh * 10) / 10,
      bookings: pt.completed_bookings,
    }));
  }, [data]);

  return (
    <div>
      {/* Title Header */}
      <div className="section-title">
        <div>
          <div className="eyebrow">FINANCIAL PERFORMANCE</div>
          <h2>Earnings & Analytics</h2>
          <p>Revenue estimations, energy throughput, and utilization trends.</p>
        </div>
        <div className="inline-actions">
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 20,
              background: '#fef3c7',
              border: '1px solid #fde68a',
              color: '#92400e',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <Info size={16} />
            <span>Estimated (simulated payments)</span>
          </div>
          <button
            onClick={() => fetchEarnings()}
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter and Range Controls */}
      <div
        className="card padded"
        style={{
          marginBottom: 24,
          background: '#ffffff',
          border: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Filter size={18} color="var(--green)" />
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>
            Analytics Range & Filters
          </span>
          {/* Quick Presets */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={() => applyPreset(7)}
              className="btn btn-outline"
              style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6 }}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => applyPreset(30)}
              className="btn btn-outline"
              style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6 }}
            >
              Last 30 Days
            </button>
            <button
              onClick={() => applyPreset(90)}
              className="btn btn-outline"
              style={{ padding: '4px 10px', fontSize: 12, borderRadius: 6 }}
            >
              Last 90 Days
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
          }}
        >
          {/* Station Selector */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--muted)',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Station
            </label>
            <select
              value={selectedStationId}
              onChange={(e) => setSelectedStationId(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid var(--line)',
                fontSize: 14,
                background: '#ffffff',
                color: 'var(--ink)',
              }}
            >
              <option value="">All Stations</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.city || 'Station #' + s.id})
                </option>
              ))}
            </select>
          </div>

          {/* Group By Interval */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--muted)',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Interval
            </label>
            <div
              style={{
                display: 'flex',
                borderRadius: 8,
                border: '1px solid var(--line)',
                overflow: 'hidden',
                background: '#f8faf9',
              }}
            >
              <button
                type="button"
                onClick={() => setGroupBy('day')}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  fontSize: 13,
                  fontWeight: 600,
                  border: 'none',
                  background: groupBy === 'day' ? 'var(--green)' : 'transparent',
                  color: groupBy === 'day' ? '#ffffff' : 'var(--muted)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                Daily
              </button>
              <button
                type="button"
                onClick={() => setGroupBy('month')}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  fontSize: 13,
                  fontWeight: 600,
                  border: 'none',
                  background: groupBy === 'month' ? 'var(--green)' : 'transparent',
                  color: groupBy === 'month' ? '#ffffff' : 'var(--muted)',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                Monthly
              </button>
            </div>
          </div>

          {/* Date From */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--muted)',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Date From
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--line)',
                fontSize: 14,
                color: 'var(--ink)',
              }}
            />
          </div>

          {/* Date To */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--muted)',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Date To
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--line)',
                fontSize: 14,
                color: 'var(--ink)',
              }}
            />
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          className="card padded"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchEarnings()}
            className="btn btn-primary"
            style={{ padding: '6px 14px', fontSize: 13 }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="stats-grid" style={{ marginBottom: 24 }}>
        {/* Estimated Revenue */}
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="stat-label">Total Estimated Revenue</div>
            <TrendingUp size={20} color="var(--green)" />
          </div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {formatPKR(totalRev)}
          </div>
          <div className="stat-sub">Based on completed session tariffs</div>
        </div>

        {/* Estimated Energy */}
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="stat-label">Total Energy Delivered</div>
            <Zap size={20} color="#eab308" />
          </div>
          <div className="stat-value">{formatKWh(totalEnergy)}</div>
          <div className="stat-sub">Estimated kWh transferred to EVs</div>
        </div>

        {/* Completed Bookings */}
        <div className="stat-card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className="stat-label">Completed Sessions</div>
            <CalendarCheck size={20} color="#3b82f6" />
          </div>
          <div className="stat-value">{totalCompleted.toLocaleString()}</div>
          <div className="stat-sub">Paid charging reservations</div>
        </div>
      </div>

      {/* Main Time-Series Chart */}
      <div className="card padded" style={{ marginBottom: 24, background: '#ffffff' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
              Historical Performance Trend ({groupBy === 'day' ? 'Daily' : 'Monthly'})
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
              Continuous time-series including inactive gap periods
            </p>
          </div>

          {/* Metric Toggle */}
          <div
            style={{
              display: 'flex',
              background: '#f1f5f3',
              borderRadius: 8,
              padding: 3,
            }}
          >
            <button
              onClick={() => setChartMetric('revenue')}
              style={{
                border: 'none',
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                background: chartMetric === 'revenue' ? '#ffffff' : 'transparent',
                color: chartMetric === 'revenue' ? 'var(--green)' : 'var(--muted)',
                boxShadow:
                  chartMetric === 'revenue' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Revenue (PKR)
            </button>
            <button
              onClick={() => setChartMetric('energy')}
              style={{
                border: 'none',
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                background: chartMetric === 'energy' ? '#ffffff' : 'transparent',
                color: chartMetric === 'energy' ? '#d97706' : 'var(--muted)',
                boxShadow:
                  chartMetric === 'energy' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              Energy (kWh)
            </button>
          </div>
        </div>

        {/* Chart View */}
        {loading ? (
          <div
            style={{
              height: 320,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f8faf9',
              borderRadius: 8,
            }}
          >
            <RefreshCw size={24} className="animate-spin" color="var(--green)" />
          </div>
        ) : chartData.length === 0 ? (
          <div
            style={{
              height: 320,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#f8faf9',
              borderRadius: 8,
              color: 'var(--muted)',
            }}
          >
            <BarChart3 size={40} style={{ opacity: 0.4, marginBottom: 12 }} />
            <p>No activity data available in the selected date range.</p>
          </div>
        ) : mounted ? (
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              {chartMetric === 'revenue' ? (
                <AreaChart
                  data={chartData}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#15803d" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#15803d" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    stroke="#cbd5e1"
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    stroke="#cbd5e1"
                    tickLine={false}
                    tickFormatter={(val) => `Rs ${val.toLocaleString()}`}
                  />
                  <Tooltip
                    formatter={(val: any) => [`Rs ${Number(val).toLocaleString()}`, 'Est. Revenue']}
                    labelFormatter={(label) => `Period: ${label}`}
                    contentStyle={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                      fontSize: 13,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--green)"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#revenueGrad)"
                  />
                </AreaChart>
              ) : (
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    stroke="#cbd5e1"
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    stroke="#cbd5e1"
                    tickLine={false}
                    tickFormatter={(val) => `${val} kWh`}
                  />
                  <Tooltip
                    formatter={(val: any) => [`${Number(val).toLocaleString()} kWh`, 'Energy Delivered']}
                    labelFormatter={(label) => `Period: ${label}`}
                    contentStyle={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 8,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
                      fontSize: 13,
                    }}
                  />
                  <Bar dataKey="energy" fill="#d97706" radius={[4, 4, 0, 0]} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        ) : (
          <div style={{ height: 320 }} />
        )}
      </div>

      {/* Per-Station Breakdown Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--line)',
            background: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--ink)' }}>
              Station Revenue Breakdown
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
              Completed bookings and earnings contribution per active charging site
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <RefreshCw size={24} className="animate-spin" color="var(--green)" style={{ margin: '0 auto 8px' }} />
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Calculating breakdown…</p>
          </div>
        ) : !data?.station_breakdown || data.station_breakdown.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--muted)' }}>
            <Layers size={36} style={{ opacity: 0.4, margin: '0 auto 12px' }} />
            <p>No stations found under your account.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8faf9', borderBottom: '1px solid var(--line)' }}>
                  <th style={{ padding: '14px 18px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                    Station
                  </th>
                  <th style={{ padding: '14px 18px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                    Completed Bookings
                  </th>
                  <th style={{ padding: '14px 18px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                    Energy Delivered
                  </th>
                  <th style={{ padding: '14px 18px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                    Estimated Revenue
                  </th>
                  <th style={{ padding: '14px 18px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                    Revenue Share
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.station_breakdown.map((st) => {
                  const sharePct =
                    totalRev > 0
                      ? Math.round((st.estimated_revenue / totalRev) * 100)
                      : 0;

                  return (
                    <tr
                      key={st.station_id}
                      style={{ borderBottom: '1px solid var(--line)', transition: 'background 0.15s' }}
                      className="hover:bg-slate-50"
                    >
                      <td style={{ padding: '14px 18px', fontSize: 14 }}>
                        <Link
                          href={`/business/stations/${st.station_id}`}
                          style={{
                            fontWeight: 600,
                            color: 'var(--green)',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <Building2 size={15} />
                          {st.station_name || `Station #${st.station_id}`}
                        </Link>
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: 14, color: 'var(--ink)' }}>
                        <span style={{ fontWeight: 600 }}>{st.completed_bookings}</span> sessions
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: 14, color: 'var(--ink)' }}>
                        {formatKWh(st.estimated_energy_kwh)}
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>
                        {formatPKR(st.estimated_revenue)}
                      </td>
                      <td style={{ padding: '14px 18px', fontSize: 13, color: 'var(--muted)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div
                            style={{
                              flex: 1,
                              maxWidth: 100,
                              height: 6,
                              borderRadius: 3,
                              background: '#e2e8f0',
                              overflow: 'hidden',
                            }}
                          >
                            <div
                              style={{
                                width: `${sharePct}%`,
                                height: '100%',
                                background: 'var(--green)',
                              }}
                            />
                          </div>
                          <span>{sharePct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
