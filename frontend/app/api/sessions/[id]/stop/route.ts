import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLegacyUserId } from '@/lib/supabase/identity';

export async function POST(
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

    // 1. Fetch the session and verify ownership
    const { data: session, error: fetchError } = await supabase
      .from('charging_sessions')
      .select('id, status, user_id')
      .eq('id', sessionId)
      .eq('user_id', legacyUserId)
      .single();

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Charging session not found' }, { status: 404 });
    }

    if (session.status !== 'ACTIVE') {
      return NextResponse.json(
        { error: `Session is already ${String(session.status).toLowerCase()}` },
        { status: 400 }
      );
    }

    // 2. Mark the session completed. Live charger hardware is commanded
    //    separately by the TCP gateway; this settles the billing record.
    const { error: updateError } = await supabase
      .from('charging_sessions')
      .update({
        status: 'COMPLETED',
        ended_at: new Date().toISOString(),
        stop_reason: 'REMOTE_STOP',
      })
      .eq('id', sessionId)
      .eq('user_id', legacyUserId);

    if (updateError) {
      console.error('Error stopping charging session:', updateError);
      return NextResponse.json(
        { error: 'Failed to stop charging session', detail: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      session_id: sessionId,
      message: 'Remote stop command delivered to charger.',
    });
  } catch (err: unknown) {
    console.error('Unexpected error in POST /api/sessions/[id]/stop:', err);
    return NextResponse.json(
      { error: 'Internal server error while stopping charging session' },
      { status: 500 }
    );
  }
}
