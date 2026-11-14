import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const city = searchParams.get('city');
    const status = searchParams.get('status');

    let query = supabase
      .from('stations')
      .select('*, connectors(*)');

    if (city) {
      query = query.ilike('city', `%${city}%`);
    }
    if (status) {
      query = query.eq('status', status.toUpperCase());
    }

    const { data: stations, error } = await query;

    if (error) {
      console.error('Error fetching stations:', error);
      return NextResponse.json(
        { error: 'Failed to retrieve stations from database', detail: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(stations || []);
  } catch (err: unknown) {
    console.error('Unexpected error in /api/stations:', err);
    return NextResponse.json(
      { error: 'Internal server error while retrieving stations' },
      { status: 500 }
    );
  }
}
