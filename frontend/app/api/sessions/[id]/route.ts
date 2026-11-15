import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLegacyUserId } from '@/lib/supabase/identity';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionId = parseInt(id, 10);
    if (isNaN(sessionId)) {
      return NextResponse.json({ error: 'Invalid session ID' }, { status: 400 });
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

    const { data: session, error: dbError } = await supabase
      .from('charging_sessions')
      .select('*, connector:connectors(connector_type, station:stations(name))')
      .eq('id', sessionId)
      .eq('user_id', legacyUserId)
      .single();

    if (dbError || !session) {
      return NextResponse.json({ error: 'Charging session not found' }, { status: 404 });
    }

    const connector = (
      session as unknown as {
        connector?: { connector_type?: string; station?: { name?: string } };
      }
    ).connector;
    const startedAt = session.started_at ? new Date(session.started_at) : null;
    const endedAt = session.ended_at ? new Date(session.ended_at) : null;

    return NextResponse.json({
      id: session.id,
      connector_id: session.connector_id,
      booking_id: session.booking_id,
      user_id: session.user_id,
      status: session.status,
      started_at: session.started_at,
      ended_at: session.ended_at,
      duration_minutes:
        startedAt && endedAt
          ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000))
          : undefined,
      soc_start: session.soc_start,
      soc_end: session.soc_end,
      kwh_delivered: Number(session.kwh_delivered ?? 0),
      peak_power_kw: Number(session.peak_power_kw ?? 0),
      cost: Number(session.cost ?? 0),
      stop_reason: session.stop_reason,
      station_name: connector?.station?.name ?? null,
      connector_type: connector?.connector_type ?? null,
    });
  } catch (err: unknown) {
    console.error('Unexpected error in GET /api/sessions/[id]:', err);
    return NextResponse.json(
      { error: 'Internal server error while fetching charging session' },
      { status: 500 }
    );
  }
}
