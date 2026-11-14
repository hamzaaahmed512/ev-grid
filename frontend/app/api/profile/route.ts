import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    const metadata = user.user_metadata || {};
    return NextResponse.json({
      id: user.id,
      name: metadata.full_name || metadata.name || user.email?.split('@')[0] || 'EV Driver',
      email: user.email || '',
      phone: user.phone || metadata.phone || null,
      city: metadata.city || null,
      profile_image_url: metadata.avatar_url || metadata.picture || null,
      role: metadata.role || 'driver',
      created_at: user.created_at,
      updated_at: user.updated_at || null,
    });
  } catch (err: unknown) {
    console.error('Unexpected error in GET /api/profile:', err);
    return NextResponse.json(
      { error: 'Internal server error while retrieving profile' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
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
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined) updates.full_name = body.name;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.city !== undefined) updates.city = body.city;
    if (body.profile_image_url !== undefined) updates.avatar_url = body.profile_image_url;

    const { data: updated, error: updateError } = await supabase.auth.updateUser({
      data: updates,
    });

    if (updateError || !updated.user) {
      return NextResponse.json(
        { error: 'Failed to update user profile', detail: updateError?.message },
        { status: 400 }
      );
    }

    const metadata = updated.user.user_metadata || {};
    return NextResponse.json({
      id: updated.user.id,
      name: metadata.full_name || metadata.name || updated.user.email?.split('@')[0] || 'EV Driver',
      email: updated.user.email || '',
      phone: updated.user.phone || metadata.phone || null,
      city: metadata.city || null,
      profile_image_url: metadata.avatar_url || metadata.picture || null,
      role: metadata.role || 'driver',
      created_at: updated.user.created_at,
      updated_at: updated.user.updated_at || null,
    });
  } catch (err: unknown) {
    console.error('Unexpected error in PATCH /api/profile:', err);
    return NextResponse.json(
      { error: 'Internal server error while updating profile' },
      { status: 500 }
    );
  }
}
