import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLegacyUserId } from '@/lib/supabase/identity';

export async function GET(request: NextRequest) {
  try {
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

    const { searchParams } = new URL(request.url);
    const skip = Math.max(0, parseInt(searchParams.get('skip') ?? '0', 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50));

    const { data: sessions, error: dbError } = await supabase
      .from('charging_sessions')
      .select('*, connector:connectors(connector_type, station:stations(name))')
      .eq('user_id', legacyUserId)
      .order('started_at', { ascending: false })
      .range(skip, skip + limit - 1);

    if (dbError) {
      console.error('Error fetching charging sessions:', dbError);
      return NextResponse.json(
        { error: 'Failed to retrieve charging sessions', detail: dbError.message },
        { status: 500 }
      );
    }

    const mapped = (sessions ?? []).map((s: Record<string, unknown>) => {
      const connector = s.connector as
        | { connector_type?: string; station?: { name?: string } }
        | undefined;
      const startedAt = s.started_at ? new Date(String(s.started_at)) : null;
      const endedAt = s.ended_at ? new Date(String(s.ended_at)) : null;
      const durationMinutes =
        startedAt && endedAt
          ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000))
          : undefined;

      return {
        id: s.id,
        connector_id: s.connector_id,
        booking_id: s.booking_id,
        user_id: s.user_id,
        status: s.status,
        started_at: s.started_at,
        ended_at: s.ended_at,
        duration_minutes: durationMinutes,
        soc_start: s.soc_start,
        soc_end: s.soc_end,
        kwh_delivered: Number(s.kwh_delivered ?? 0),
        peak_power_kw: Number(s.peak_power_kw ?? 0),
        cost: Number(s.cost ?? 0),
        stop_reason: s.stop_reason,
        station_name: connector?.station?.name ?? null,
        connector_type: connector?.connector_type ?? null,
      };
    });

    return NextResponse.json({ count: mapped.length, sessions: mapped });
  } catch (err: unknown) {
    console.error('Unexpected error in GET /api/sessions/me:', err);
    return NextResponse.json(
      { error: 'Internal server error while fetching charging sessions' },
      { status: 500 }
    );
  }
}
