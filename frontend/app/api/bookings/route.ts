import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    // Guard: Return clean 401 if not authenticated
    if (!user || authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');

    let query = supabase
      .from('bookings')
      .select('*, vehicle:vehicles(*), station:stations(*), connector:connectors(*)')
      .eq('user_id', user.id)
      .order('start_time', { ascending: false });

    if (statusFilter) {
      query = query.eq('status', statusFilter.toUpperCase());
    }

    const { data: bookings, error: dbError } = await query;

    if (dbError) {
      console.error('Error fetching bookings:', dbError);
      return NextResponse.json(
        { error: 'Failed to retrieve bookings', detail: dbError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      count: bookings?.length ?? 0,
      bookings: bookings ?? [],
    });
  } catch (err: unknown) {
    console.error('Unexpected error in GET /api/bookings:', err);
    return NextResponse.json(
      { error: 'Internal server error while fetching bookings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    // Guard: Return clean 401 if not authenticated
    if (!user || authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { vehicle_id, connector_id, start_time, duration_minutes } = body;

    if (!vehicle_id || !connector_id || !start_time || !duration_minutes) {
      return NextResponse.json(
        { error: 'Missing required fields: vehicle_id, connector_id, start_time, duration_minutes' },
        { status: 400 }
      );
    }

    const startDate = new Date(start_time);
    if (isNaN(startDate.getTime())) {
      return NextResponse.json({ error: 'Invalid start_time format' }, { status: 400 });
    }

    const now = new Date();
    if (startDate <= now) {
      return NextResponse.json({ error: 'start_time must be in the future' }, { status: 400 });
    }

    const endDate = new Date(startDate.getTime() + duration_minutes * 60 * 1000);

    // 1. Fetch connector & station info
    const { data: connector, error: connError } = await supabase
      .from('connectors')
      .select('*, stations(*)')
      .eq('id', connector_id)
      .single();

    if (connError || !connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    // 2. Fetch user vehicle & verify ownership
    const { data: vehicle, error: vehError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', vehicle_id)
      .eq('user_id', user.id)
      .single();

    if (vehError || !vehicle) {
      return NextResponse.json(
        { error: 'Vehicle not found in your garage or not owned by you' },
        { status: 404 }
      );
    }

    // 3. Connector compatibility check
    if (
      connector.connector_type &&
      vehicle.connector_type &&
      connector.connector_type.trim().toLowerCase() !== vehicle.connector_type.trim().toLowerCase()
    ) {
      return NextResponse.json(
        {
          error: `Connector mismatch: vehicle requires ${vehicle.connector_type}, but connector is ${connector.connector_type}`,
        },
        { status: 400 }
      );
    }

    // 4. Overlap / Exclusion constraint check for slot collision
    const { data: clashingBookings, error: clashError } = await supabase
      .from('bookings')
      .select('id, start_time, end_time')
      .eq('connector_id', connector_id)
      .eq('status', 'CONFIRMED')
      .lt('start_time', endDate.toISOString())
      .gt('end_time', startDate.toISOString());

    if (clashError) {
      console.error('Error verifying booking slot availability:', clashError);
      return NextResponse.json(
        { error: 'Could not verify slot availability', detail: clashError.message },
        { status: 500 }
      );
    }

    if (clashingBookings && clashingBookings.length > 0) {
      return NextResponse.json(
        { error: 'Connector is already booked for this time slot. Please choose another time.' },
        { status: 409 }
      );
    }

    // 5. Insert new reservation
    const { data: newBooking, error: insertError } = await supabase
      .from('bookings')
      .insert({
        user_id: user.id,
        vehicle_id: vehicle.id,
        station_id: connector.station_id,
        connector_id: connector.id,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        status: 'CONFIRMED',
      })
      .select('*, vehicle:vehicles(*), station:stations(*), connector:connectors(*)')
      .single();

    if (insertError) {
      console.error('Error inserting booking:', insertError);
      return NextResponse.json(
        { error: 'Failed to record reservation', detail: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(newBooking, { status: 201 });
  } catch (err: unknown) {
    console.error('Unexpected error in POST /api/bookings:', err);
    return NextResponse.json(
      { error: 'Internal server error while processing booking' },
      { status: 500 }
    );
  }
}
