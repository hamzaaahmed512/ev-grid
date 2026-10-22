'use client';

import { useState, useEffect, type FormEvent } from 'react';
import {
  Car,
  Plus,
  Trash2,
  Edit3,
  BatteryCharging,
  Zap,
  AlertCircle,
  X,
  Check,
  Calendar,
  Layers,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { vehicleApi, type ApiVehicle, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';

export const CONNECTOR_OPTIONS = [
  { value: 'CCS2', label: 'CCS2 (Combined Charging System 2)' },
  { value: 'CCS1', label: 'CCS1 (Combined Charging System 1)' },
  { value: 'TYPE2', label: 'Type 2 (Mennekes)' },
  { value: 'TYPE1', label: 'Type 1 (J1772)' },
  { value: 'CHADEMO', label: 'CHAdeMO' },
  { value: 'GB/T', label: 'GB/T (China Standard)' },
  { value: 'TESLA', label: 'Tesla (NACS / Proprietary)' },
];

interface VehiclesViewProps {
  notify: (msg: string) => void;
  onNavigateToAuth?: () => void;
}

export default function VehiclesView({ notify, onNavigateToAuth }: VehiclesViewProps) {
  const { user, loading: authLoading } = useAuth();

  const [vehicles, setVehicles] = useState<ApiVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<ApiVehicle | null>(null);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState<number>(2024);
  const [batteryCapacity, setBatteryCapacity] = useState<string>('75.0');
  const [connectorType, setConnectorType] = useState('CCS2');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete State
  const [deleteConfirmVehicle, setDeleteConfirmVehicle] = useState<ApiVehicle | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchVehicles = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await vehicleApi.list();
      setVehicles(data);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setError('Please sign in to view and manage your vehicles.');
        } else {
          setError(err.detail || 'Failed to load vehicles from server.');
        }
      } else {
        setError('Network error: Unable to reach the API server.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) {
      fetchVehicles();
    }
  }, [authLoading, user]);

  const openAddModal = () => {
    setEditingVehicle(null);
    setMake('');
    setModel('');
    setYear(new Date().getFullYear());
    setBatteryCapacity('60.0');
    setConnectorType('CCS2');
    setFormError(null);
    setModalOpen(true);
  };

  const openEditModal = (vehicle: ApiVehicle) => {
    setEditingVehicle(vehicle);
    setMake(vehicle.make);
    setModel(vehicle.model);
    setYear(vehicle.year);
    setBatteryCapacity(String(vehicle.battery_capacity_kwh));
    setConnectorType(vehicle.connector_type);
    setFormError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (formSubmitting) return;
    setModalOpen(false);
    setEditingVehicle(null);
    setFormError(null);
  };

  const handleFormSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedMake = make.trim();
    const trimmedModel = model.trim();
    const parsedCapacity = parseFloat(batteryCapacity);

    if (!trimmedMake) {
      setFormError('Vehicle make is required.');
      return;
    }
    if (!trimmedModel) {
      setFormError('Vehicle model is required.');
      return;
    }
    if (year < 1990 || year > 2030) {
      setFormError('Year must be between 1990 and 2030.');
      return;
    }
    if (isNaN(parsedCapacity) || parsedCapacity <= 0) {
      setFormError('Battery capacity must be greater than 0 kWh.');
      return;
    }

    setFormSubmitting(true);
    try {
      if (editingVehicle) {
        const updated = await vehicleApi.update(editingVehicle.id, {
          make: trimmedMake,
          model: trimmedModel,
          year,
          battery_capacity_kwh: parsedCapacity,
          connector_type: connectorType,
        });
        setVehicles((prev) =>
          prev.map((v) => (v.id === editingVehicle.id ? updated : v))
        );
        notify(`${updated.make} ${updated.model} updated successfully`);
      } else {
        const created = await vehicleApi.create({
          make: trimmedMake,
          model: trimmedModel,
          year,
          battery_capacity_kwh: parsedCapacity,
          connector_type: connectorType,
        });
        setVehicles((prev) => [created, ...prev]);
        notify(`${created.make} ${created.model} added to your garage!`);
      }
      closeModal();
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setFormError(err.detail || 'Failed to save vehicle.');
      } else {
        setFormError('An unexpected network error occurred.');
      }
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteVehicle = async () => {
    if (!deleteConfirmVehicle) return;
    setDeleting(true);
    try {
      await vehicleApi.delete(deleteConfirmVehicle.id);
      setVehicles((prev) => prev.filter((v) => v.id !== deleteConfirmVehicle.id));
      notify(`${deleteConfirmVehicle.make} ${deleteConfirmVehicle.model} removed`);
      setDeleteConfirmVehicle(null);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        notify(`Error: ${err.detail}`);
      } else {
        notify('Failed to delete vehicle.');
      }
    } finally {
      setDeleting(false);
    }
  };

  // Fleet stats calculation
  const totalVehicles = vehicles.length;
  const totalCapacity = vehicles.reduce(
    (sum, v) => sum + Number(v.battery_capacity_kwh),
    0
  );
  const primaryConnector =
    vehicles.length > 0 ? vehicles[0].connector_type : '—';

  return (
    <div className="vehicles-container">
      {/* Header with Title and Add Button */}
      <div className="section-title">
        <div>
          <div className="eyebrow">DRIVER WORKSPACE</div>
          <h2>My Vehicles</h2>
          <p>
            Manage your registered electric vehicles, battery capacities, and
            connector standards for seamless station compatibility.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={openAddModal}
          disabled={!user}
          title={!user ? 'Sign in to add vehicles' : 'Add a new vehicle'}
        >
          <Plus size={16} /> Add Vehicle
        </button>
      </div>

      {/* Overview Stats Cards */}
      <div className="stats-grid">
        <div className="stat card">
          <div className="stat-top">
            <span>Fleet size</span>
            <div className="icon-tile">
              <Car size={19} />
            </div>
          </div>
          <strong>{totalVehicles}</strong>
          <small>Registered EVs</small>
        </div>

        <div className="stat card">
          <div className="stat-top">
            <span>Primary standard</span>
            <div className="icon-tile">
              <Zap size={19} />
            </div>
          </div>
          <strong>{primaryConnector}</strong>
          <small>Default connector plug</small>
        </div>

        <div className="stat card">
          <div className="stat-top">
            <span>Total battery</span>
            <div className="icon-tile">
              <BatteryCharging size={19} />
            </div>
          </div>
          <strong>{totalCapacity.toFixed(1)} kWh</strong>
          <small>Combined storage</small>
        </div>

        <div className="stat card">
          <div className="stat-top">
            <span>Smart matching</span>
            <div className="icon-tile">
              <ShieldCheck size={19} />
            </div>
          </div>
          <strong>Active</strong>
          <small>Station filter verified</small>
        </div>
      </div>

      {/* Error or Authentication Banner */}
      {error && (
        <div
          role="alert"
          style={{
            color: '#dc2626',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 12,
            padding: '14px 18px',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
          {!user && onNavigateToAuth && (
            <button
              className="btn btn-outline btn-sm"
              onClick={onNavigateToAuth}
            >
              Sign In <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}

      {/* Main Content Area */}
      {loading ? (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: 'var(--muted)',
          }}
        >
          <Car
            size={36}
            style={{
              display: 'inline-block',
              marginBottom: 12,
              animation: 'pulse 1.5s infinite',
            }}
          />
          <p>Loading your vehicles from EV Grid…</p>
        </div>
      ) : vehicles.length === 0 ? (
        <div className="card padded empty-state">
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              background: '#e9f6ea',
              color: 'var(--green)',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px',
            }}
          >
            <Car size={32} />
          </div>
          <h3>No vehicles in your garage</h3>
          <p style={{ maxWidth: 460, margin: '0 auto 20px' }}>
            Add your electric vehicle to automatically highlight compatible
            charging stations and speed up your booking reservations.
          </p>
          <button className="btn btn-primary" onClick={openAddModal}>
            <Plus size={16} /> Add your first vehicle
          </button>
        </div>
      ) : (
        <div className="vehicle-grid">
          {vehicles.map((v) => (
            <div key={v.id} className="card padded vehicle-card">
              <div>
                <div className="vehicle-card-top">
                  <div className="vehicle-badge-icon">
                    <Car size={24} />
                  </div>
                  <span className="badge">{v.connector_type}</span>
                </div>

                <h3>
                  {v.make} {v.model}
                </h3>
                <span className="year-label">{v.year} Edition</span>

                <div className="vehicle-specs">
                  <div className="vehicle-spec-item">
                    <span>Battery Capacity</span>
                    <strong>{v.battery_capacity_kwh} kWh</strong>
                  </div>
                  <div className="vehicle-spec-item">
                    <span>Connector</span>
                    <strong>{v.connector_type}</strong>
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderTop: '1px solid var(--line)',
                  paddingTop: '1rem',
                  marginTop: '0.5rem',
                }}
              >
                <small style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
                  Added {new Date(v.created_at).toLocaleDateString()}
                </small>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    className="btn btn-light btn-sm"
                    onClick={() => openEditModal(v)}
                    title="Edit vehicle details"
                  >
                    <Edit3 size={14} /> Edit
                  </button>
                  <button
                    className="icon-button"
                    style={{ color: '#dc2626' }}
                    onClick={() => setDeleteConfirmVehicle(v)}
                    title="Remove vehicle"
                    aria-label="Remove vehicle"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Vehicle Modal */}
      {modalOpen && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="modal-dialog" role="dialog" aria-modal="true">
            <div className="modal-header">
              <h3>{editingVehicle ? 'Edit Vehicle' : 'Add New Vehicle'}</h3>
              <button
                className="icon-button"
                onClick={closeModal}
                disabled={formSubmitting}
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleFormSubmit}>
              <div className="modal-body">
                {formError && (
                  <div
                    role="alert"
                    style={{
                      color: '#dc2626',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: 8,
                      padding: '10px 14px',
                      fontSize: '0.8125rem',
                      marginBottom: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <AlertCircle size={16} />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="form-grid">
                  <label className="form-field">
                    <span>Make *</span>
                    <input
                      required
                      type="text"
                      placeholder="e.g. Tesla, BYD, Audi"
                      value={make}
                      onChange={(e) => setMake(e.target.value)}
                      maxLength={50}
                    />
                  </label>

                  <label className="form-field">
                    <span>Model *</span>
                    <input
                      required
                      type="text"
                      placeholder="e.g. Model 3, Atto 3, e-tron"
                      value={model}
                      onChange={(e) => setModel(e.target.value)}
                      maxLength={50}
                    />
                  </label>
                </div>

                <div className="form-grid">
                  <label className="form-field">
                    <span>Year (1990 - 2030) *</span>
                    <input
                      required
                      type="number"
                      min={1990}
                      max={2030}
                      value={year}
                      onChange={(e) => setYear(parseInt(e.target.value) || 2024)}
                    />
                  </label>

                  <label className="form-field">
                    <span>Battery Capacity (kWh) *</span>
                    <input
                      required
                      type="number"
                      step="0.1"
                      min="1"
                      max="300"
                      placeholder="e.g. 75.0"
                      value={batteryCapacity}
                      onChange={(e) => setBatteryCapacity(e.target.value)}
                    />
                  </label>
                </div>

                <label className="form-field">
                  <span>Connector Type *</span>
                  <select
                    value={connectorType}
                    onChange={(e) => setConnectorType(e.target.value)}
                  >
                    {CONNECTOR_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--muted)',
                    background: '#f8faf9',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--line)',
                  }}
                >
                  <strong style={{ color: 'var(--ink)' }}>Note:</strong> We
                  validate connector specifications against standard charging
                  protocols to help you find matching charging plugs.
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={closeModal}
                  disabled={formSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={formSubmitting}
                >
                  {formSubmitting
                    ? 'Saving…'
                    : editingVehicle
                    ? 'Update Vehicle'
                    : 'Save Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmVehicle && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) {
              setDeleteConfirmVehicle(null);
            }
          }}
        >
          <div
            className="modal-dialog"
            style={{ maxWidth: 440 }}
            role="alertdialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <h3 style={{ color: '#dc2626' }}>Delete Vehicle</h3>
              <button
                className="icon-button"
                onClick={() => setDeleteConfirmVehicle(null)}
                disabled={deleting}
                aria-label="Cancel delete"
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <p style={{ margin: 0, color: 'var(--ink)', fontSize: '0.875rem' }}>
                Are you sure you want to remove{' '}
                <strong>
                  {deleteConfirmVehicle.make} {deleteConfirmVehicle.model} (
                  {deleteConfirmVehicle.year})
                </strong>{' '}
                from your garage? This action cannot be undone.
              </p>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setDeleteConfirmVehicle(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeleteVehicle}
                disabled={deleting}
              >
                {deleting ? 'Removing…' : 'Delete Vehicle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
