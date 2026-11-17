'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ownerApi,
  OwnerStation,
  StationCreateInput,
  StationUpdateInput,
  OwnerApiError,
} from '@/lib/api/owner';
import { MapPin, AlertCircle, Save, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface StationFormProps {
  initialData?: OwnerStation | null;
  isEdit?: boolean;
}

export default function StationForm({ initialData, isEdit = false }: StationFormProps) {
  const router = useRouter();

  // Form State
  const [name, setName] = useState(initialData?.name || '');
  const [address, setAddress] = useState(initialData?.address || '');
  const [city, setCity] = useState(initialData?.city || 'Lahore');
  const [pricePerKwh, setPricePerKwh] = useState<string>(
    initialData?.price_per_kwh != null ? String(initialData.price_per_kwh) : ''
  );
  const [openTime, setOpenTime] = useState(
    initialData?.open_time ? initialData.open_time.slice(0, 5) : '08:00'
  );
  const [closeTime, setCloseTime] = useState(
    initialData?.close_time ? initialData.close_time.slice(0, 5) : '22:00'
  );
  const [latitude, setLatitude] = useState<string>(
    initialData?.latitude != null ? String(initialData.latitude) : '31.5204'
  );
  const [longitude, setLongitude] = useState<string>(
    initialData?.longitude != null ? String(initialData.longitude) : '74.3587'
  );

  // Validation & Error States
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Leaflet Map Refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Initialize Map
  useEffect(() => {
    let alive = true;
    import('leaflet').then((L) => {
      if (!alive || !mapContainerRef.current || mapInstanceRef.current) return;

      const lat = parseFloat(latitude) || 31.5204;
      const lng = parseFloat(longitude) || 74.3587;

      const map = L.map(mapContainerRef.current).setView([lat, lng], 13);
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      // Custom marker icon
      const customIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `<div style="background:#16803c;width:24px;height:24px;border-radius:50%;border:3px solid white;box-shadow:0 3px 8px rgba(0,0,0,0.3)"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const marker = L.marker([lat, lng], { draggable: true, icon: customIcon }).addTo(map);
      markerRef.current = marker;

      // Handle marker drag
      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        setLatitude(pos.lat.toFixed(6));
        setLongitude(pos.lng.toFixed(6));
      });

      // Handle map click
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        marker.setLatLng([lat, lng]);
        setLatitude(lat.toFixed(6));
        setLongitude(lng.toFixed(6));
      });

      setTimeout(() => map.invalidateSize(), 200);
    });

    return () => {
      alive = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync marker position when manual lat/long inputs change
  useEffect(() => {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (!isNaN(lat) && !isNaN(lng) && markerRef.current && mapInstanceRef.current) {
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        markerRef.current.setLatLng([lat, lng]);
        mapInstanceRef.current.panTo([lat, lng]);
      }
    }
  }, [latitude, longitude]);

  function validate(): boolean {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors.name = 'Station name is required.';
    } else if (name.trim().length < 3 || name.trim().length > 100) {
      errors.name = 'Name must be between 3 and 100 characters.';
    }

    const lat = parseFloat(latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errors.latitude = 'Latitude must be between -90 and 90.';
    }

    const lng = parseFloat(longitude);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      errors.longitude = 'Longitude must be between -180 and 180.';
    }

    if (openTime && closeTime && openTime >= closeTime) {
      errors.close_time = 'Closing time must be later than opening time.';
    }

    if (pricePerKwh !== '') {
      const price = parseFloat(pricePerKwh);
      if (isNaN(price) || price < 0 || price > 1000) {
        errors.price_per_kwh = 'Price per kWh must be between 0 and 1000.';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setGeneralError(null);

    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload: StationCreateInput | StationUpdateInput = {
        name: name.trim(),
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        open_time: openTime ? `${openTime}:00` : undefined,
        close_time: closeTime ? `${closeTime}:00` : undefined,
        price_per_kwh: pricePerKwh !== '' ? parseFloat(pricePerKwh) : undefined,
      };

      if (isEdit && initialData) {
        await ownerApi.updateStation(initialData.id, payload);
      } else {
        await ownerApi.createStation(payload as StationCreateInput);
      }

      router.push('/business/stations');
    } catch (err: any) {
      if (err instanceof OwnerApiError) {
        setGeneralError(err.message);
        if (err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
          setFieldErrors((prev) => ({ ...prev, ...err.fieldErrors }));
        }
      } else {
        setGeneralError('Failed to save station. Please verify your entries.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <Link href="/business/stations" className="back-link" style={{ marginBottom: 0 }}>
          <ArrowLeft size={16} /> Back to Stations
        </Link>
        <div className="inline-actions">
          <Link href="/business/stations" className="btn btn-light btn-sm">
            Cancel
          </Link>
          <button type="submit" disabled={submitting} className="btn btn-primary btn-sm">
            <Save size={14} /> {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Station'}
          </button>
        </div>
      </div>

      {generalError && (
        <div
          role="alert"
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#dc2626',
            borderRadius: 12,
            padding: '14px 18px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 13,
          }}
        >
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div>{generalError}</div>
        </div>
      )}

      <div className="two-grid" style={{ alignItems: 'start', marginTop: 0 }}>
        {/* Left Column: Form Fields */}
        <div className="card padded">
          <h3 style={{ fontSize: 18, marginBottom: 18 }}>Station Information</h3>

          {/* Name */}
          <div className="form-field">
            <label htmlFor="station-name">Station Name *</label>
            <input
              id="station-name"
              type="text"
              placeholder="e.g. Gulberg Fast Hub"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFieldErrors((prev) => ({ ...prev, name: '' }));
              }}
              required
            />
            {fieldErrors.name && (
              <span style={{ color: '#dc2626', fontSize: 11, marginTop: 4 }}>{fieldErrors.name}</span>
            )}
          </div>

          {/* Address & City */}
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="station-address">Street Address</label>
              <input
                id="station-address"
                type="text"
                placeholder="Plot 12, Main Boulevard"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="form-field">
              <label htmlFor="station-city">City</label>
              <select id="station-city" value={city} onChange={(e) => setCity(e.target.value)}>
                <option value="Lahore">Lahore</option>
                <option value="Islamabad">Islamabad</option>
                <option value="Rawalpindi">Rawalpindi</option>
                <option value="Karachi">Karachi</option>
                <option value="Faisalabad">Faisalabad</option>
              </select>
            </div>
          </div>

          {/* Default Price per kWh */}
          <div className="form-field">
            <label htmlFor="price-per-kwh">Default Tariff (Rs / kWh)</label>
            <input
              id="price-per-kwh"
              type="number"
              step="0.5"
              min="0"
              max="1000"
              placeholder="e.g. 45.00"
              value={pricePerKwh}
              onChange={(e) => {
                setPricePerKwh(e.target.value);
                setFieldErrors((prev) => ({ ...prev, price_per_kwh: '' }));
              }}
            />
            <small style={{ color: 'var(--muted)', fontSize: 11, marginTop: 4 }}>
              Used as fallback price if individual connectors don't have custom tariffs.
            </small>
            {fieldErrors.price_per_kwh && (
              <span style={{ color: '#dc2626', fontSize: 11, marginTop: 4 }}>
                {fieldErrors.price_per_kwh}
              </span>
            )}
          </div>

          {/* Operating Hours */}
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="open-time">Open Time</label>
              <input
                id="open-time"
                type="time"
                value={openTime}
                onChange={(e) => {
                  setOpenTime(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, close_time: '' }));
                }}
              />
            </div>

            <div className="form-field">
              <label htmlFor="close-time">Close Time</label>
              <input
                id="close-time"
                type="time"
                value={closeTime}
                onChange={(e) => {
                  setCloseTime(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, close_time: '' }));
                }}
              />
              {fieldErrors.close_time && (
                <span style={{ color: '#dc2626', fontSize: 11, marginTop: 4 }}>
                  {fieldErrors.close_time}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Interactive Map & Coordinates */}
        <div className="card padded">
          <h3 style={{ fontSize: 18, marginBottom: 8 }}>Location Coordinates</h3>
          <p style={{ color: 'var(--muted)', fontSize: 12, marginBottom: 16 }}>
            Click anywhere on the map or drag the pin to set the exact charger position.
          </p>

          {/* Map Surface */}
          <div
            ref={mapContainerRef}
            style={{
              width: '100%',
              height: 280,
              borderRadius: 12,
              overflow: 'hidden',
              marginBottom: 16,
              border: '1px solid var(--line)',
            }}
          />

          {/* Fallback Number Inputs */}
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="station-lat">
                <MapPin size={12} style={{ display: 'inline', marginRight: 4 }} />
                Latitude (-90 to 90) *
              </label>
              <input
                id="station-lat"
                type="number"
                step="0.000001"
                min="-90"
                max="90"
                value={latitude}
                onChange={(e) => {
                  setLatitude(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, latitude: '' }));
                }}
                required
              />
              {fieldErrors.latitude && (
                <span style={{ color: '#dc2626', fontSize: 11, marginTop: 4 }}>
                  {fieldErrors.latitude}
                </span>
              )}
            </div>

            <div className="form-field">
              <label htmlFor="station-lng">
                <MapPin size={12} style={{ display: 'inline', marginRight: 4 }} />
                Longitude (-180 to 180) *
              </label>
              <input
                id="station-lng"
                type="number"
                step="0.000001"
                min="-180"
                max="180"
                value={longitude}
                onChange={(e) => {
                  setLongitude(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, longitude: '' }));
                }}
                required
              />
              {fieldErrors.longitude && (
                <span style={{ color: '#dc2626', fontSize: 11, marginTop: 4 }}>
                  {fieldErrors.longitude}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
