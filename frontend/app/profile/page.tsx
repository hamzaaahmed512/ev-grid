'use client';

import { useState, useEffect, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ChevronRight,
  User,
  Mail,
  Phone,
  MapPin,
  Image as ImageIcon,
  ShieldCheck,
  Save,
  CheckCircle2,
  AlertCircle,
  Car,
  CalendarDays,
  Calendar,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { updateProfile, type UserProfileUpdateInput, ApiError } from '../../lib/api';

const PRESET_AVATARS = [
  { label: 'Driver 1', url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80' },
  { label: 'Driver 2', url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80' },
  { label: 'Driver 3', url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80' },
  { label: 'Driver 4', url: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80' },
];

export default function ProfilePage() {
  const { user, loading: authLoading, refreshUser } = useAuth();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync form state when user changes
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
      setCity(user.city || '');
      setProfileImageUrl(user.profile_image_url || '');
    }
  }, [user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('Full name is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const updatePayload: UserProfileUpdateInput = {
        name: trimmedName,
        phone: phone.trim() || null,
        city: city.trim() || null,
        profile_image_url: profileImageUrl.trim() || null,
      };

      await updateProfile(updatePayload);
      await refreshUser();
      setSuccessMessage('Profile updated successfully!');
      setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setErrorMessage(err.detail || 'Failed to update profile.');
      } else {
        setErrorMessage('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const getInitials = (n?: string) => {
    if (!n) return 'EV';
    return n
      .split(' ')
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--pale)', paddingBottom: '4rem' }}>
      {/* Top Header / Breadcrumb Bar */}
      <header
        style={{
          height: 76,
          padding: '0 clamp(1rem, 3vw, 2.5rem)',
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
          <div className="breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="breadcrumb-workspace">Workspace</span>
            <ChevronRight className="breadcrumb-separator" size={14} />
            <strong>User Profile</strong>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link
            href="/vehicles"
            className="btn btn-light btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Car size={14} /> My Garage
          </Link>
          <Link
            href="/dashboard/bookings"
            className="btn btn-outline btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <CalendarDays size={14} /> Bookings
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main
        style={{
          width: '100%',
          maxWidth: 960,
          margin: '0 auto',
          padding: '2rem clamp(1.25rem, 3vw, 2.5rem)',
        }}
      >
        {/* Page Title */}
        <div className="section-title">
          <div>
            <div className="eyebrow">ACCOUNT SETTINGS</div>
            <h2>Driver Profile & Identity</h2>
            <p>
              Manage your personal information, contact number, and avatar for charging reservations.
            </p>
          </div>
        </div>

        {authLoading ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
            <User size={36} style={{ display: 'inline-block', marginBottom: 12, animation: 'pulse 1.5s infinite' }} />
            <p>Loading profile details…</p>
          </div>
        ) : !user ? (
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
              <User size={32} />
            </div>
            <h3>Authentication Required</h3>
            <p style={{ maxWidth: 440, margin: '0 auto 20px' }}>
              Please sign in with your EV Grid account to view and edit your profile settings.
            </p>
            <Link href="/" className="btn btn-primary">
              Return Home to Sign In
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Feedback Alerts */}
            {successMessage && (
              <div
                role="status"
                style={{
                  color: '#166534',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: 12,
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: '0.875rem',
                }}
              >
                <CheckCircle2 size={18} />
                <span>{successMessage}</span>
              </div>
            )}

            {errorMessage && (
              <div
                role="alert"
                style={{
                  color: '#dc2626',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: 12,
                  padding: '14px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  fontSize: '0.875rem',
                }}
              >
                <AlertCircle size={18} />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Profile Overview Banner Card */}
            <div className="card padded" style={{ background: '#ffffff' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1.5rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                  {profileImageUrl ? (
                    <img
                      src={profileImageUrl}
                      alt={user.name}
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 20,
                        objectFit: 'cover',
                        border: '2px solid var(--green)',
                      }}
                      onError={(e) => {
                        // Fallback on invalid image url
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                  ) : null}
                  {(!profileImageUrl || undefined) && (
                    <div
                      className="avatar"
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: 20,
                        fontSize: '1.5rem',
                        fontWeight: 800,
                      }}
                    >
                      {getInitials(user.name)}
                    </div>
                  )}

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <h3 style={{ margin: 0, fontSize: '1.375rem' }}>{user.name}</h3>
                      <span className="badge" style={{ background: '#e5f6e9', color: '#16803c' }}>
                        {user.role ? user.role.toUpperCase() : 'DRIVER'}
                      </span>
                    </div>
                    <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: '0.875rem' }}>
                      {user.email}
                    </p>
                    {user.city && (
                      <span
                        style={{
                          fontSize: '0.8125rem',
                          color: '#4b6354',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          marginTop: 4,
                        }}
                      >
                        <MapPin size={13} /> {user.city}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      background: '#f8faf8',
                      padding: '10px 16px',
                      borderRadius: 12,
                      border: '1px solid var(--line)',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ fontSize: '0.6875rem', color: 'var(--muted)', display: 'block' }}>
                      ACCOUNT ID
                    </span>
                    <strong style={{ fontSize: '0.9375rem', color: 'var(--ink)' }}>#{user.id}</strong>
                  </div>

                  <div
                    style={{
                      background: '#f8faf8',
                      padding: '10px 16px',
                      borderRadius: 12,
                      border: '1px solid var(--line)',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ fontSize: '0.6875rem', color: 'var(--muted)', display: 'block' }}>
                      STATUS
                    </span>
                    <strong style={{ fontSize: '0.9375rem', color: '#16803c', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <ShieldCheck size={14} /> Verified
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            {/* Edit Profile Form Card */}
            <div className="card padded">
              <h3 style={{ fontSize: '1.125rem', marginBottom: '1.25rem' }}>Edit Personal Details</h3>

              <form onSubmit={handleSubmit}>
                <div className="form-grid">
                  <label className="form-field">
                    <span>Full Name *</span>
                    <div style={{ position: 'relative' }}>
                      <input
                        required
                        type="text"
                        placeholder="Your full name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={100}
                      />
                    </div>
                  </label>

                  <label className="form-field">
                    <span>Email Address (Read-only)</span>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="email"
                        value={user.email}
                        readOnly
                        disabled
                        style={{ background: '#f4f7f5', color: '#687e71', cursor: 'not-allowed' }}
                      />
                    </div>
                  </label>
                </div>

                <div className="form-grid">
                  <label className="form-field">
                    <span>Phone Number</span>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="tel"
                        placeholder="e.g. +92 300 1234567"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        maxLength={50}
                      />
                    </div>
                  </label>

                  <label className="form-field">
                    <span>City</span>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="e.g. Lahore, Islamabad, Karachi"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        maxLength={100}
                      />
                    </div>
                  </label>
                </div>

                {/* Profile Image URL & Presets */}
                <label className="form-field">
                  <span>Profile Image URL</span>
                  <input
                    type="url"
                    placeholder="https://example.com/avatar.jpg"
                    value={profileImageUrl}
                    onChange={(e) => setProfileImageUrl(e.target.value)}
                    maxLength={1000}
                  />
                </label>

                {/* Preset Avatars Bar */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: '0.6875rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--muted)',
                      marginBottom: 8,
                    }}
                  >
                    Or select a sample avatar:
                  </span>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    {PRESET_AVATARS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setProfileImageUrl(preset.url)}
                        style={{
                          border: profileImageUrl === preset.url ? '2px solid var(--green)' : '1px solid var(--line)',
                          borderRadius: '50%',
                          padding: 2,
                          background: 'white',
                          cursor: 'pointer',
                        }}
                        title={`Select ${preset.label}`}
                      >
                        <img
                          src={preset.url}
                          alt={preset.label}
                          style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' }}
                        />
                      </button>
                    ))}
                    {profileImageUrl && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                        onClick={() => setProfileImageUrl('')}
                      >
                        Clear Avatar
                      </button>
                    )}
                  </div>
                </div>

                {/* Submit Action */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', borderTop: '1px solid var(--line)', paddingTop: '1.25rem' }}>
                  <Link href="/vehicles" className="btn btn-outline">
                    Back to Garage
                  </Link>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSubmitting}
                  >
                    <Save size={16} />
                    {isSubmitting ? 'Saving Changes…' : 'Save Profile Changes'}
                  </button>
                </div>
              </form>
            </div>

            {/* Account Details Footer Card */}
            <div className="card padded" style={{ background: '#fcfdfc' }}>
              <h4 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', margin: '0 0 1rem' }}>
                Account Information
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.8125rem' }}>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Account Role</span>
                  <strong>{user.role || 'driver'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Member Since</span>
                  <strong>{new Date(user.created_at).toLocaleDateString()}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--muted)', display: 'block', marginBottom: 2 }}>Charging Permissions</span>
                  <strong style={{ color: '#16803c' }}>Standard Active</strong>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

