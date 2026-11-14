import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PUT(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const bookingId = parseInt(id, 10);
    if (isNaN(bookingId)) {
      return NextResponse.json({ error: 'Invalid booking ID' }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    // Guard: Return clean 401 if not authenticated
    if (!user || authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 1. Fetch booking and verify ownership
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Booking is already cancelled' }, { status: 400 });
    }
    if (booking.status === 'COMPLETED') {
      return NextResponse.json({ error: 'Cannot cancel a completed booking' }, { status: 400 });
    }
    if (new Date(booking.start_time) <= new Date()) {
      return NextResponse.json(
        { error: 'Cannot cancel a booking that has already started or passed' },
        { status: 400 }
      );
    }

    // 2. Mark cancelled
    const { data: updated, error: updateError } = await supabase
      .from('bookings')
      .update({ status: 'CANCELLED' })
      .eq('id', bookingId)
      .select('*, vehicle:vehicles(*), station:stations(*), connector:connectors(*)')
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to cancel booking', detail: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(updated);
  } catch (err: unknown) {
    console.error('Unexpected error in PUT /api/bookings/[id]/cancel:', err);
    return NextResponse.json(
      { error: 'Internal server error while cancelling booking' },
      { status: 500 }
    );
  }
}
