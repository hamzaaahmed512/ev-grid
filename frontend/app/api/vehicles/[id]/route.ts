import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLegacyUserId } from '@/lib/supabase/identity';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const vehicleId = parseInt(id, 10);
    if (isNaN(vehicleId)) {
      return NextResponse.json({ error: 'Invalid vehicle ID' }, { status: 400 });
    }

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

    const { data: vehicle, error: dbError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('id', vehicleId)
      .eq('user_id', legacyUserId)
      .single();

    if (dbError || !vehicle) {
      return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
    }

    return NextResponse.json(vehicle);
  } catch (err: unknown) {
    console.error('Unexpected error in GET /api/vehicles/[id]:', err);
    return NextResponse.json(
      { error: 'Internal server error while fetching vehicle' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const vehicleId = parseInt(id, 10);
    if (isNaN(vehicleId)) {
      return NextResponse.json({ error: 'Invalid vehicle ID' }, { status: 400 });
    }

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

    const body = await request.json();

    if (body.is_primary === true) {
      await supabase
        .from('vehicles')
        .update({ is_primary: false })
        .eq('user_id', legacyUserId);
    }

    const { data: updated, error: updateError } = await supabase
      .from('vehicles')
      .update(body)
      .eq('id', vehicleId)
      .eq('user_id', legacyUserId)
      .select('*')
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: 'Vehicle not found or update failed', detail: updateError?.message },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (err: unknown) {
    console.error('Unexpected error in PATCH /api/vehicles/[id]:', err);
    return NextResponse.json(
      { error: 'Internal server error while updating vehicle' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const vehicleId = parseInt(id, 10);
    if (isNaN(vehicleId)) {
      return NextResponse.json({ error: 'Invalid vehicle ID' }, { status: 400 });
    }

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

    // Check if was primary
    const { data: toDelete } = await supabase
      .from('vehicles')
      .select('is_primary')
      .eq('id', vehicleId)
      .eq('user_id', legacyUserId)
      .single();

    const { error: deleteError } = await supabase
      .from('vehicles')
      .delete()
      .eq('id', vehicleId)
      .eq('user_id', legacyUserId);

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to delete vehicle', detail: deleteError.message },
        { status: 500 }
      );
    }

    // If deleted vehicle was primary, promote another one
    if (toDelete?.is_primary) {
      const { data: remaining } = await supabase
        .from('vehicles')
        .select('id')
        .eq('user_id', legacyUserId)
        .limit(1);

      if (remaining && remaining.length > 0) {
        await supabase
          .from('vehicles')
          .update({ is_primary: true })
          .eq('id', remaining[0].id);
      }
    }

    return new Response(null, { status: 204 });
  } catch (err: unknown) {
    console.error('Unexpected error in DELETE /api/vehicles/[id]:', err);
    return NextResponse.json(
      { error: 'Internal server error while deleting vehicle' },
      { status: 500 }
    );
  }
}
