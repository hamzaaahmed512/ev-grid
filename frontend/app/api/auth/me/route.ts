import { NextResponse } from 'next/server';
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
    let role = metadata.role || 'driver';

    // Fetch authoritative backend role from users table
    try {
      if (user.email) {
        const { data: dbUser } = await supabase
          .from('users')
          .select('role')
          .eq('email', user.email)
          .maybeSingle();
        if (dbUser?.role) {
          role = dbUser.role;
        }
      }
    } catch {
      // Keep metadata fallback
    }

    return NextResponse.json({
      id: user.id,
      name: metadata.full_name || metadata.name || user.email?.split('@')[0] || 'EV Driver',
      email: user.email || '',
      phone: user.phone || metadata.phone || null,
      city: metadata.city || null,
      profile_image_url: metadata.avatar_url || metadata.picture || metadata.profile_image_url || null,
      role: role,
      created_at: user.created_at,
      updated_at: user.updated_at || null,
    });
  } catch (err: unknown) {
    console.error('Unexpected error in GET /api/auth/me:', err);
    return NextResponse.json(
      { error: 'Internal server error while fetching user profile' },
      { status: 500 }
    );
  }
}
