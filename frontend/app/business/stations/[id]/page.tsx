'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  ownerApi,
  OwnerStation,
  OwnerConnector,
  ConnectorCreateInput,
  ConnectorUpdateInput,
  OwnerApiError,
} from '@/lib/api/owner';
import {
  Building2,
  Plus,
  Edit,
  Trash2,
  AlertCircle,
  Clock,
  MapPin,
  ArrowLeft,
  PlugZap,
  Activity,
  X,
  Check,
} from 'lucide-react';

const VALID_CONNECTOR_TYPES = [
  'CCS2',
  'Type 2',
  'CHAdeMO',
  'GB/T',
  'CCS1',
  'Type 1',
  'Tesla',
  'Socket',
];

export default function StationDetailPage() {
  const params = useParams();
  const stationId = Number(params?.id);

  const [station, setStation] = useState<OwnerStation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingConnector, setEditingConnector] = useState<OwnerConnector | null>(null);
  const [modalLabel, setModalLabel] = useState('');
  const [modalType, setModalType] = useState('CCS2');
  const [modalPower, setModalPower] = useState('50');
  const [modalPrice, setModalPrice] = useState('');
  const [modalFieldErrors, setModalFieldErrors] = useState<Record<string, string>>({});
  const [modalSubmitting, setModalSubmitting] = useState(false);

  // Status updating map
  const [updatingStatusId, setUpdatingStatusId] = useState<number | null>(null);
  const [deletingConnectorId, setDeletingConnectorId] = useState<number | null>(null);

  // Live polling state
  const isMountedRef = useRef(true);

  const fetchStation = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await ownerApi.getStation(stationId);
      if (isMountedRef.current) {
        setStation(data);
        setError(null);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        if (!silent) {
          if (err instanceof OwnerApiError) {
            setError(err.message);
          } else {
            setError('Failed to load station details.');
          }
        }
      }
    } finally {
      if (!silent && isMountedRef.current) setLoading(false);
    }
  }, [stationId]);

  // Initial load
  useEffect(() => {
    isMountedRef.current = true;
    if (stationId && !isNaN(stationId)) {
      fetchStation(false);
    } else {
      setError('Invalid station ID.');
      setLoading(false);
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [stationId, fetchStation]);

  // Polling every 10 seconds, pausing when document is hidden
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      fetchStation(true);
    }, 10000);

    return () => clearInterval(interval);
  }, [fetchStation]);

  // Connector Limit Check
  const stationType = station?.type || 'B2P';
  const connectorLimit = stationType === 'P2P' ? 1 : 6;
  const activeConnectors = (station?.connectors || []).filter((c) => c.is_active);
  const isLimitReached = activeConnectors.length >= connectorLimit;

  // Open Modal for Add
  function openAddModal() {
    setEditingConnector(null);
    setModalLabel(`Bay ${activeConnectors.length + 1}`);
    setModalType('CCS2');
    setModalPower('50');
    setModalPrice(station?.price_per_kwh != null ? String(station.price_per_kwh) : '');
    setModalFieldErrors({});
    setActionError(null);
    setActionSuccess(null);
    setModalOpen(true);
  }

  // Open Modal for Edit
  function openEditModal(c: OwnerConnector) {
    setEditingConnector(c);
    setModalLabel(c.label || '');
    setModalType(c.connector_type);
    setModalPower(String(c.power_kw));
    setModalPrice(c.price_per_kwh != null ? String(c.price_per_kwh) : '');
    setModalFieldErrors({});
    setActionError(null);
    setActionSuccess(null);
    setModalOpen(true);
  }

  // Handle Save Connector (Create or Update)
  async function handleSaveConnector(e: React.FormEvent) {
    e.preventDefault();
    setModalFieldErrors({});
    setActionError(null);

    const power = parseFloat(modalPower);
    if (isNaN(power) || power < 1 || power > 400) {
      setModalFieldErrors({ power_kw: 'Power must be between 1 and 400 kW.' });
      return;
    }

    let price: number | undefined = undefined;
    if (modalPrice.trim() !== '') {
      price = parseFloat(modalPrice);
      if (isNaN(price) || price < 0 || price > 1000) {
        setModalFieldErrors({ price_per_kwh: 'Price must be between 0 and 1000.' });
        return;
      }
    }

    setModalSubmitting(true);
    try {
      if (editingConnector) {
        const updatePayload: ConnectorUpdateInput = {
          label: modalLabel.trim() || undefined,
          connector_type: modalType,
          power_kw: power,
          price_per_kwh: price,
        };
        await ownerApi.updateConnector(editingConnector.id, updatePayload);
        setActionSuccess('Connector updated successfully.');
      } else {
        const createPayload: ConnectorCreateInput = {
          label: modalLabel.trim() || undefined,
          connector_type: modalType,
          power_kw: power,
          price_per_kwh: price,
        };
        await ownerApi.addConnector(stationId, createPayload);
        setActionSuccess('New connector added successfully.');
      }

      setModalOpen(false);
      fetchStation(true);
    } catch (err: any) {
      if (err instanceof OwnerApiError) {
        setActionError(err.message);
        if (err.fieldErrors) {
          setModalFieldErrors(err.fieldErrors);
        }
      } else {
        setActionError('Failed to save connector.');
      }
    } finally {
      setModalSubmitting(false);
    }
  }

  // Handle Status Switch (AVAILABLE, OFFLINE, DISABLED)
  async function handleStatusChange(connectorId: number, newStatus: 'AVAILABLE' | 'OFFLINE' | 'DISABLED') {
    setUpdatingStatusId(connectorId);
    setActionError(null);
    setActionSuccess(null);
    try {
      await ownerApi.patchConnectorStatus(connectorId, newStatus);
      setActionSuccess(`Connector status updated to ${newStatus}.`);
      fetchStation(true);
    } catch (err: any) {
      if (err instanceof OwnerApiError) {
        setActionError(err.message);
      } else {
        setActionError('Failed to update connector status.');
      }
    } finally {
      setUpdatingStatusId(null);
    }
  }

  // Handle Delete Connector
  async function handleDeleteConnector(connector: OwnerConnector) {
    const label = connector.label || `${connector.connector_type} #${connector.id}`;
    if (!window.confirm(`Are you sure you want to delete connector "${label}"?`)) return;

    setDeletingConnectorId(connector.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await ownerApi.deleteConnector(connector.id);
      setActionSuccess('Connector deactivated successfully.');
      fetchStation(true);
    } catch (err: any) {
      if (err instanceof OwnerApiError) {
        setActionError(err.message);
      } else {
        setActionError('Failed to delete connector.');
      }
    } finally {
      setDeletingConnectorId(null);
    }
  }

  const getStatusBadgeTone = (status: string) => {
    switch (status.toUpperCase()) {
      case 'AVAILABLE':
        return 'green';
      case 'CHARGING':
        return 'blue';
      case 'FAULT':
        return 'red';
      case 'DISABLED':
        return 'amber';
      case 'OFFLINE':
      default:
        return 'gray';
    }
  };

  if (loading) {
    return (
      <div>
        <div className="section-title">
          <div>
            <div className="eyebrow">STATION MANAGEMENT</div>
            <h2>Loading details…</h2>
          </div>
        </div>
        <div className="card padded" style={{ height: 200, background: '#f5f8f6', marginBottom: 24 }} />
        <div className="card padded" style={{ height: 350, background: '#f5f8f6' }} />
      </div>
    );
  }

  if (error || !station) {
    return (
      <div className="card padded" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <AlertCircle size={40} color="#dc2626" style={{ margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: 20, marginBottom: 8 }}>Station not found</h3>
        <p style={{ color: 'var(--muted)', marginBottom: 20 }}>{error || 'Unable to find this station.'}</p>
        <Link href="/business/stations" className="btn btn-primary">
          Back to Stations
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Navigation Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <Link href="/business/stations" className="back-link" style={{ marginBottom: 0 }}>
          <ArrowLeft size={16} /> Back to Stations
        </Link>
        <div className="inline-actions">
          <span style={{ fontSize: 11, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Activity size={14} style={{ color: '#16a34a' }} />
            Live polling every 10s (pauses when tab hidden)
          </span>
          <Link href={`/business/stations/${station.id}/edit`} className="btn btn-light btn-sm">
            <Edit size={14} /> Edit Station
          </Link>
        </div>
      </div>

      {/* Action Banners */}
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
          <div>{actionError}</div>
        </div>
      )}

      {actionSuccess && (
        <div
          role="status"
          style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            color: '#166534',
            borderRadius: 12,
            padding: '14px 18px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 13,
          }}
        >
          <Check size={20} style={{ flexShrink: 0 }} />
          <div>{actionSuccess}</div>
        </div>
      )}

      {/* Station Overview Hero Card */}
      <div className="card padded" style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span className="badge" style={{ fontSize: 10 }}>{station.type}</span>
              <span className={`badge ${station.is_active ? 'green' : 'gray'}`}>
                {station.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
            <h1 style={{ fontSize: 26, margin: '4px 0 8px' }}>{station.name}</h1>
            <p style={{ color: 'var(--muted)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
              <MapPin size={15} />
              {station.address || 'Address not specified'}{station.city ? `, ${station.city}` : ''}
            </p>
          </div>

          {/* Quick Metrics */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ padding: '12px 18px', background: '#f8faf9', borderRadius: 12, border: '1px solid #e5ebe7' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>Default Tariff</span>
              <strong style={{ fontSize: 16, color: 'var(--ink)' }}>
                {station.price_per_kwh != null ? `Rs ${station.price_per_kwh}/kWh` : 'None'}
              </strong>
            </div>

            <div style={{ padding: '12px 18px', background: '#f8faf9', borderRadius: 12, border: '1px solid #e5ebe7' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>Hours</span>
              <strong style={{ fontSize: 16, color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Clock size={14} />
                {station.open_time && station.close_time ? `${station.open_time.slice(0, 5)} - ${station.close_time.slice(0, 5)}` : '24h Open'}
              </strong>
            </div>

            <div style={{ padding: '12px 18px', background: '#f8faf9', borderRadius: 12, border: '1px solid #e5ebe7' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', display: 'block' }}>Plugs Capacity</span>
              <strong style={{ fontSize: 16, color: isLimitReached ? '#dc2626' : 'var(--green)' }}>
                {activeConnectors.length} / {connectorLimit} max
              </strong>
            </div>
          </div>
        </div>
      </div>

      {/* Connectors Table Section */}
      <div className="card padded">
        <div className="section-title" style={{ marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 19, marginBottom: 4 }}>Charging Bays &amp; Connectors</h3>
            <p>
              Manage plug hardware, operating status, and capacity. (
              {stationType} station limit: {connectorLimit} active plugs)
            </p>
          </div>

          <div className="inline-actions">
            <button
              onClick={openAddModal}
              disabled={isLimitReached}
              title={
                isLimitReached
                  ? `Limit reached: ${stationType} stations allow at most ${connectorLimit} connector(s)`
                  : 'Add a new charging point'
              }
              className="btn btn-primary"
            >
              <Plus size={16} /> Add Connector
            </button>
          </div>
        </div>

        {activeConnectors.length === 0 ? (
          <div className="empty-state" style={{ padding: '50px 20px' }}>
            <PlugZap size={40} style={{ color: '#a0b4a7', marginBottom: 12 }} />
            <h3 style={{ fontSize: 18, marginBottom: 6 }}>No connectors configured</h3>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 18 }}>
              Add at least one connector so drivers can discover and book this station.
            </p>
            <button onClick={openAddModal} className="btn btn-primary btn-sm">
              <Plus size={14} /> Add First Connector
            </button>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bay / Label</th>
                  <th>Type</th>
                  <th>Power (kW)</th>
                  <th>Price / kWh</th>
                  <th>Status</th>
                  <th>Set Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {station.connectors?.map((c) => {
                  if (!c.is_active) return null;
                  const effectivePrice =
                    c.price_per_kwh != null ? c.price_per_kwh : station.price_per_kwh;

                  return (
                    <tr key={c.id}>
                      <td className="bold-cell">
                        {c.label || `${c.connector_type} #${c.id}`}
                      </td>
                      <td>
                        <span className="badge gray" style={{ fontSize: 11 }}>
                          {c.connector_type}
                        </span>
                      </td>
                      <td>{c.power_kw} kW</td>
                      <td>
                        {effectivePrice != null ? (
                          <span>
                            Rs {effectivePrice}
                            {c.price_per_kwh == null && (
                              <small style={{ color: 'var(--muted)', marginLeft: 4 }}>(station default)</small>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>Rs 0.00</span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${getStatusBadgeTone(c.status)}`}>
                          {c.status}
                        </span>
                      </td>
                      <td>
                        {/* Status Switch: AVAILABLE, OFFLINE, DISABLED */}
                        <select
                          aria-label={`Update status for connector ${c.id}`}
                          value={['AVAILABLE', 'OFFLINE', 'DISABLED'].includes(c.status) ? c.status : ''}
                          disabled={updatingStatusId === c.id}
                          onChange={(e) =>
                            handleStatusChange(c.id, e.target.value as 'AVAILABLE' | 'OFFLINE' | 'DISABLED')
                          }
                          style={{
                            padding: '6px 10px',
                            fontSize: 11,
                            borderRadius: 8,
                            border: '1px solid var(--line)',
                            background: 'white',
                            color: 'var(--ink)',
                            width: 120,
                          }}
                        >
                          {!['AVAILABLE', 'OFFLINE', 'DISABLED'].includes(c.status) && (
                            <option value="" disabled>
                              {c.status} (live)
                            </option>
                          )}
                          <option value="AVAILABLE">Available</option>
                          <option value="OFFLINE">Offline</option>
                          <option value="DISABLED">Disabled</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="inline-actions" style={{ justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => openEditModal(c)}
                            className="btn btn-light btn-sm"
                            title="Edit connector"
                          >
                            <Edit size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteConnector(c)}
                            disabled={deletingConnectorId === c.id}
                            className="btn btn-light btn-sm"
                            style={{ color: '#dc2626' }}
                            title="Delete connector"
                          >
                            <Trash2 size={14} />
                          </button>
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

      {/* Add / Edit Connector Modal */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 100,
            padding: 20,
          }}
        >
          <div
            className="card padded"
            style={{
              width: '100%',
              maxWidth: 480,
              background: 'white',
              boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 18, margin: 0 }}>
                {editingConnector ? 'Edit Charging Connector' : 'Add Charging Connector'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="icon-button"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveConnector}>
              {/* Label */}
              <div className="form-field">
                <label htmlFor="conn-label">Label / Bay Name</label>
                <input
                  id="conn-label"
                  type="text"
                  placeholder="e.g. Bay 1 (CCS2 Fast)"
                  value={modalLabel}
                  onChange={(e) => setModalLabel(e.target.value)}
                />
              </div>

              {/* Connector Type */}
              <div className="form-field">
                <label htmlFor="conn-type">Connector Type *</label>
                <select
                  id="conn-type"
                  value={modalType}
                  onChange={(e) => setModalType(e.target.value)}
                  required
                >
                  {VALID_CONNECTOR_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Power kW */}
              <div className="form-field">
                <label htmlFor="conn-power">Power (kW) *</label>
                <input
                  id="conn-power"
                  type="number"
                  step="0.5"
                  min="1"
                  max="400"
                  value={modalPower}
                  onChange={(e) => setModalPower(e.target.value)}
                  required
                />
                {modalFieldErrors.power_kw && (
                  <span style={{ color: '#dc2626', fontSize: 11, marginTop: 4 }}>
                    {modalFieldErrors.power_kw}
                  </span>
                )}
              </div>

              {/* Custom Tariff */}
              <div className="form-field">
                <label htmlFor="conn-price">Custom Tariff (Rs / kWh)</label>
                <input
                  id="conn-price"
                  type="number"
                  step="0.5"
                  min="0"
                  max="1000"
                  placeholder={`Leave blank to use station tariff (Rs ${station.price_per_kwh ?? 0})`}
                  value={modalPrice}
                  onChange={(e) => setModalPrice(e.target.value)}
                />
                {modalFieldErrors.price_per_kwh && (
                  <span style={{ color: '#dc2626', fontSize: 11, marginTop: 4 }}>
                    {modalFieldErrors.price_per_kwh}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="btn btn-light btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="btn btn-primary btn-sm"
                >
                  {modalSubmitting ? 'Saving…' : editingConnector ? 'Update Plug' : 'Add Plug'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
