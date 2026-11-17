'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import StationForm from '@/components/business/StationForm';
import { ownerApi, OwnerStation, OwnerApiError } from '@/lib/api/owner';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function EditStationPage() {
  const params = useParams();
  const stationId = Number(params?.id);

  const [station, setStation] = useState<OwnerStation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!stationId || isNaN(stationId)) {
      setError('Invalid station ID.');
      setLoading(false);
      return;
    }

    async function fetchStation() {
      try {
        const data = await ownerApi.getStation(stationId);
        setStation(data);
      } catch (err: any) {
        if (err instanceof OwnerApiError) {
          setError(err.message);
        } else {
          setError('Failed to load station details.');
        }
      } finally {
        setLoading(false);
      }
    }

    fetchStation();
  }, [stationId]);

  if (loading) {
    return (
      <div>
        <div className="section-title">
          <div>
            <div className="eyebrow">EDIT STATION</div>
            <h2>Loading station details…</h2>
          </div>
        </div>
        <div className="card padded" style={{ height: 350, background: '#f5f8f6' }} />
      </div>
    );
  }

  if (error || !station) {
    return (
      <div className="card padded" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <AlertCircle size={40} color="#dc2626" style={{ margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: 20, marginBottom: 8 }}>Station not found</h3>
        <p style={{ color: 'var(--muted)', marginBottom: 20 }}>{error || 'Unable to load the requested station.'}</p>
        <Link href="/business/stations" className="btn btn-primary">
          Back to Stations
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="section-title">
        <div>
          <div className="eyebrow">UPDATE LOCATION</div>
          <h2>Edit {station.name}</h2>
          <p>Modify operating hours, pricing tariffs, and geographic position.</p>
        </div>
      </div>
      <StationForm initialData={station} isEdit />
    </div>
  );
}
