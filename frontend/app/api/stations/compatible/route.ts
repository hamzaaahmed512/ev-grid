import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLegacyUserId } from '@/lib/supabase/identity';

function normalizeConnectorType(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]/g, '');
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const legacyUserId = await getLegacyUserId(supabase, user);
    if (!legacyUserId) {
      return NextResponse.json({ error: 'User profile not provisioned' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const vehicleId = parseInt(searchParams.get('vehicle_id') ?? '', 10);
    if (isNaN(vehicleId)) {
      return NextResponse.json({ error: 'Invalid or missing vehicle_id' }, { status: 400 });
    }

    const { data: vehicle, error: vehError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', vehicleId)
      .eq('user_id', legacyUserId)
      .single();

    if (vehError || !vehicle) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    const { data: stations, error: dbError } = await supabase
      .from('stations')
      .select('*, connectors(*)')
      .eq('status', 'AVAILABLE');

    if (dbError) {
      console.error('Error fetching compatible stations:', dbError);
      return NextResponse.json(
        { error: 'Failed to retrieve compatible stations', detail: dbError.message },
        { status: 500 }
      );
    }

    const vehicleConnector = normalizeConnectorType(vehicle.connector_type ?? '');
    const compatible = (stations ?? []).map((station: any) => {
      const matching = (station.connectors ?? []).some(
        (c: { connector_type: string }) =>
          normalizeConnectorType(c.connector_type ?? '') === vehicleConnector
      );
      return { ...station, is_compatible: matching };
    }).filter((s: any) => s.is_compatible);

    return NextResponse.json({
      vehicle: {
        id: vehicle.id,
        name: vehicle.nickname || `${vehicle.make} ${vehicle.model}`.trim(),
        year: vehicle.year,
        connector_type: vehicle.connector_type,
        battery_capacity_kwh: vehicle.battery_capacity_kwh,
      },
      total_compatible: compatible.length,
      stations: compatible,
    });
  } catch (err: unknown) {
    console.error('Unexpected error in /api/stations/compatible:', err);
    return NextResponse.json(
      { error: 'Internal server error while fetching compatible stations' },
      { status: 500 }
    );
  }
}
