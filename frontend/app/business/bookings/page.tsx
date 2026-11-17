'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ownerApi,
  OwnerBooking,
  OwnerStation,
  OwnerConnector,
  OwnerApiError,
} from '@/lib/api/owner';
import {
  CalendarCheck,
  Filter,
  Search,
  RefreshCw,
  AlertCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Building2,
  PlugZap,
  User,
  Calendar,
} from 'lucide-react';

export default function BusinessBookingsPage() {
  // Filter States
  const [stations, setStations] = useState<OwnerStation[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>('');
  const [stationConnectors, setStationConnectors] = useState<OwnerConnector[]>([]);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  // Pagination & Data States
  const [bookings, setBookings] = useState<OwnerBooking[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load list of stations for dropdown once
  useEffect(() => {
    async function loadStations() {
      try {
        const res = await ownerApi.listStations({ page: 1, page_size: 100 });
        setStations(res.items || []);
      } catch (err) {
        // Station load failure handled silently or in filter
      }
    }
    loadStations();
  }, []);

  // When selectedStationId changes, load connectors for that station if selected
  useEffect(() => {
    setSelectedConnectorId('');
    if (!selectedStationId) {
      setStationConnectors([]);
      return;
    }

    async function loadConnectors() {
      try {
        const st = await ownerApi.getStation(Number(selectedStationId));
        setStationConnectors(st.connectors || []);
      } catch (err) {
        setStationConnectors([]);
      }
    }
    loadConnectors();
  }, [selectedStationId]);

  // Fetch bookings whenever filters or page changes
  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await ownerApi.getBookings({
        station_id: selectedStationId ? Number(selectedStationId) : undefined,
        connector_id: selectedConnectorId ? Number(selectedConnectorId) : undefined,
        status: selectedStatus !== 'All' ? selectedStatus : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        page,
        page_size: pageSize,
      });

      setBookings(res.bookings || []);
      setTotal(res.total || 0);
    } catch (err: any) {
      if (err instanceof OwnerApiError) {
        setError(err.message);
      } else {
        setError('Failed to fetch bookings. Please check your network and retry.');
      }
    } finally {
      setLoading(false);
    }
  }, [selectedStationId, selectedConnectorId, selectedStatus, dateFrom, dateTo, page]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  // Handler for reset filters
  function handleResetFilters() {
    setSelectedStationId('');
    setSelectedConnectorId('');
    setSelectedStatus('All');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const formatDateTime = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const renderStatusBadge = (status: string) => {
    const s = (status || '').toUpperCase();
    if (s === 'CONFIRMED') {
      return (
        <span
          className="badge"
          style={{ background: 'var(--mint)', color: 'var(--green)', fontWeight: 600 }}
        >
          CONFIRMED
        </span>
      );
    }
    if (s === 'COMPLETED') {
      return (
        <span
          className="badge"
          style={{ background: '#dcfce7', color: '#15803d', fontWeight: 600 }}
        >
          COMPLETED
        </span>
      );
    }
    if (s === 'CANCELLED') {
      return (
        <span
          className="badge"
          style={{ background: '#fee2e2', color: '#b91c1c', fontWeight: 600 }}
        >
          CANCELLED
        </span>
      );
    }
    return <span className="badge">{status}</span>;
  };

  const hasActiveFilters =
    Boolean(selectedStationId) ||
    Boolean(selectedConnectorId) ||
    selectedStatus !== 'All' ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

  return (
    <div>
      {/* Title Header */}
      <div className="section-title">
        <div>
          <div className="eyebrow">RESERVATIONS & USAGE</div>
          <h2>Bookings Management</h2>
          <p>Track all charging sessions, driver reservations, and plug utilization.</p>
        </div>
        <div className="inline-actions">
          <button
            onClick={() => fetchBookings()}
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Bar */}
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
            Filter Bookings
          </span>
          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              style={{
                marginLeft: 'auto',
                fontSize: 13,
                color: 'var(--muted)',
                textDecoration: 'underline',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Reset all filters
            </button>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 16,
          }}
        >
          {/* Station Filter */}
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
              onChange={(e) => {
                setSelectedStationId(e.target.value);
                setPage(1);
              }}
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

          {/* Connector Filter */}
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
              Connector
            </label>
            <select
              value={selectedConnectorId}
              onChange={(e) => {
                setSelectedConnectorId(e.target.value);
                setPage(1);
              }}
              disabled={!selectedStationId || stationConnectors.length === 0}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid var(--line)',
                fontSize: 14,
                background:
                  !selectedStationId || stationConnectors.length === 0
                    ? '#f1f5f3'
                    : '#ffffff',
                color: 'var(--ink)',
              }}
            >
              <option value="">
                {!selectedStationId
                  ? 'All (Select station first)'
                  : stationConnectors.length === 0
                  ? 'No active connectors'
                  : 'All Connectors'}
              </option>
              {stationConnectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label || `${c.connector_type} (${c.power_kw} kW)`}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
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
              Status
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
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
              <option value="All">All Statuses</option>
              <option value="CONFIRMED">CONFIRMED</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="CANCELLED">CANCELLED</option>
            </select>
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
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
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
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
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
            onClick={() => fetchBookings()}
            className="btn btn-primary"
            style={{ padding: '6px 14px', fontSize: 13 }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Bookings Table / Content */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <RefreshCw
              size={28}
              color="var(--green)"
              className="animate-spin"
              style={{ margin: '0 auto 12px' }}
            />
            <p style={{ color: 'var(--muted)' }}>Loading bookings…</p>
          </div>
        ) : bookings.length === 0 ? (
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <CalendarCheck
              size={48}
              color="var(--muted)"
              style={{ margin: '0 auto 16px', opacity: 0.5 }}
            />
            <h3 style={{ fontSize: 18, marginBottom: 8, color: 'var(--ink)' }}>
              No bookings found
            </h3>
            <p
              style={{
                color: 'var(--muted)',
                maxWidth: 400,
                margin: '0 auto 20px',
                fontSize: 14,
              }}
            >
              {hasActiveFilters
                ? 'No reservations matched your selected filters. Try broadening your date range or clearing filters.'
                : 'Your stations do not have any driver reservations yet. When drivers book slots, they will appear here in real time.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={handleResetFilters}
                className="btn btn-outline"
                style={{ fontSize: 14 }}
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8faf9', borderBottom: '1px solid var(--line)' }}>
                  <th style={{ padding: '14px 18px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                    ID
                  </th>
                  <th style={{ padding: '14px 18px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                    Station
                  </th>
                  <th style={{ padding: '14px 18px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                    Connector
                  </th>
                  <th style={{ padding: '14px 18px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                    Driver
                  </th>
                  <th style={{ padding: '14px 18px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                    Start Time
                  </th>
                  <th style={{ padding: '14px 18px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                    End Time
                  </th>
                  <th style={{ padding: '14px 18px', fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase' }}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr
                    key={b.booking_id}
                    style={{ borderBottom: '1px solid var(--line)', transition: 'background 0.15s' }}
                    className="hover:bg-slate-50"
                  >
                    <td style={{ padding: '14px 18px', fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                      #{b.booking_id}
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 14 }}>
                      <Link
                        href={`/business/stations/${b.station_id}`}
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
                        {b.station_name || `Station #${b.station_id}`}
                      </Link>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 14, color: 'var(--ink)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <PlugZap size={14} color="var(--muted)" />
                        {b.connector_label || `Connector #${b.connector_id}`}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 14, color: 'var(--ink)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <User size={14} color="var(--muted)" />
                        {/* Only driver_name is displayed. Driver email/phone are never revealed */}
                        {b.driver_name || 'Anonymous Driver'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 13, color: 'var(--muted)' }}>
                      {formatDateTime(b.start_time)}
                    </td>
                    <td style={{ padding: '14px 18px', fontSize: 13, color: 'var(--muted)' }}>
                      {formatDateTime(b.end_time)}
                    </td>
                    <td style={{ padding: '14px 18px' }}>
                      {renderStatusBadge(b.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {!loading && bookings.length > 0 && (
          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid var(--line)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: '#ffffff',
            }}
          >
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              Showing{' '}
              <strong style={{ color: 'var(--ink)' }}>
                {(page - 1) * pageSize + 1}
              </strong>{' '}
              to{' '}
              <strong style={{ color: 'var(--ink)' }}>
                {Math.min(page * pageSize, total)}
              </strong>{' '}
              of <strong style={{ color: 'var(--ink)' }}>{total}</strong> bookings
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn btn-outline"
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  opacity: page <= 1 ? 0.4 : 1,
                  cursor: page <= 1 ? 'not-allowed' : 'pointer',
                }}
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span style={{ fontSize: 13, color: 'var(--muted)', padding: '0 8px' }}>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn btn-outline"
                style={{
                  padding: '6px 12px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  opacity: page >= totalPages ? 0.4 : 1,
                  cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                }}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
