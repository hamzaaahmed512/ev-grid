import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLegacyUserId } from '@/lib/supabase/identity';

export async function PATCH(
  _request: Request,
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

    // Reset others
    await supabase
      .from('vehicles')
      .update({ is_primary: false })
      .eq('user_id', legacyUserId);

    // Set this one as primary
    const { data: updated, error: updateError } = await supabase
      .from('vehicles')
      .update({ is_primary: true })
      .eq('id', vehicleId)
      .eq('user_id', legacyUserId)
      .select('*')
      .single();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: 'Vehicle not found or could not be set as primary', detail: updateError?.message },
        { status: 404 }
      );
    }

    return NextResponse.json(updated);
  } catch (err: unknown) {
    console.error('Unexpected error in PATCH /api/vehicles/[id]/set-primary:', err);
    return NextResponse.json(
      { error: 'Internal server error while setting primary vehicle' },
      { status: 500 }
    );
  }
}
