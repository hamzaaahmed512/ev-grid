'use client';

import React from 'react';
import StationForm from '@/components/business/StationForm';

export default function NewStationPage() {
  return (
    <div>
      <div className="section-title">
        <div>
          <div className="eyebrow">NEW LOCATION</div>
          <h2>Register Commercial Station</h2>
          <p>Add a new B2P charging location to your business network.</p>
        </div>
      </div>
      <StationForm />
    </div>
  );
}
