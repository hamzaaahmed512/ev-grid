import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLegacyUserId } from '@/lib/supabase/identity';

export async function GET() {
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

    const legacyUserId = await getLegacyUserId(supabase, user);
    if (!legacyUserId) {
      return NextResponse.json({ error: 'User profile not provisioned' }, { status: 401 });
    }

    const { data: vehicle, error: dbError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('user_id', legacyUserId)
      .eq('is_primary', true)
      .maybeSingle();

    if (dbError) {
      return NextResponse.json(
        { error: 'Failed to fetch primary vehicle', detail: dbError.message },
        { status: 500 }
      );
    }

    if (!vehicle) {
      return NextResponse.json({ error: 'No primary vehicle set' }, { status: 404 });
    }

    return NextResponse.json(vehicle);
  } catch (err: unknown) {
    console.error('Unexpected error in GET /api/vehicles/primary:', err);
    return NextResponse.json(
      { error: 'Internal server error while fetching primary vehicle' },
      { status: 500 }
    );
  }
}
