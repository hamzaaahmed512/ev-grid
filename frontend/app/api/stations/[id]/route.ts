import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const stationId = parseInt(id, 10);
    if (isNaN(stationId)) {
      return NextResponse.json({ error: 'Invalid station ID' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: station, error } = await supabase
      .from('stations')
      .select('*, connectors(*)')
      .eq('id', stationId)
      .single();

    if (error || !station) {
      return NextResponse.json({ error: 'Station not found' }, { status: 404 });
    }

    return NextResponse.json(station);
  } catch (err: unknown) {
    console.error('Unexpected error in /api/stations/[id]:', err);
    return NextResponse.json(
      { error: 'Internal server error while fetching station details' },
      { status: 500 }
    );
  }
}
