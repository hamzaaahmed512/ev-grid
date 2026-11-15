import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLegacyUserId } from '@/lib/supabase/identity';

export async function GET(_request: NextRequest) {
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

    const { data: vehicles, error: dbError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('user_id', legacyUserId)
      .order('created_at', { ascending: false });

    if (dbError) {
      console.error('Error fetching vehicles:', dbError);
      return NextResponse.json(
        { error: 'Failed to retrieve vehicles', detail: dbError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(vehicles || []);
  } catch (err: unknown) {
    console.error('Unexpected error in GET /api/vehicles:', err);
    return NextResponse.json(
      { error: 'Internal server error while fetching vehicles' },
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

    const legacyUserId = await getLegacyUserId(supabase, user);
    if (!legacyUserId) {
      return NextResponse.json({ error: 'User profile not provisioned' }, { status: 401 });
    }

    const body = await request.json();
    const {
      make,
      model,
      year,
      battery_capacity_kwh,
      connector_type,
      max_power_kw,
      nickname,
      range_km,
      color,
      license_plate,
      is_primary,
    } = body;

    if (!make || !model || !year || !battery_capacity_kwh || !connector_type) {
      return NextResponse.json(
        { error: 'Missing required vehicle fields: make, model, year, battery_capacity_kwh, connector_type' },
        { status: 400 }
      );
    }

    // Check count to see if this is first vehicle
    const { count, error: countError } = await supabase
      .from('vehicles')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', legacyUserId);

    if (countError) {
      console.error('Error checking vehicle count:', countError);
    }

    const shouldBePrimary = count === 0 || Boolean(is_primary);

    if (shouldBePrimary && count && count > 0) {
      await supabase
        .from('vehicles')
        .update({ is_primary: false })
        .eq('user_id', legacyUserId);
    }

    const { data: created, error: insertError } = await supabase
      .from('vehicles')
      .insert({
        user_id: legacyUserId,
        make: make.trim(),
        model: model.trim(),
        year: parseInt(year, 10),
        battery_capacity_kwh: parseFloat(battery_capacity_kwh),
        connector_type: connector_type.trim(),
        max_power_kw: max_power_kw ? parseFloat(max_power_kw) : 50.0,
        nickname: nickname ? nickname.trim() : null,
        range_km: range_km ? parseInt(range_km, 10) : null,
        color: color ? color.trim() : null,
        license_plate: licensePlateFormatted(license_plate),
        is_primary: shouldBePrimary,
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('Error inserting vehicle:', insertError);
      return NextResponse.json(
        { error: 'Failed to create vehicle record', detail: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json(created, { status: 201 });
  } catch (err: unknown) {
    console.error('Unexpected error in POST /api/vehicles:', err);
    return NextResponse.json(
      { error: 'Internal server error while creating vehicle' },
      { status: 500 }
    );
  }
}

function licensePlateFormatted(val: unknown): string | null {
  if (typeof val === 'string' && val.trim().length > 0) {
    return val.trim();
  }
  return null;
}
