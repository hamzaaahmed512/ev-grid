import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

interface ActiveSessionRow {
  id: number;
  status: string;
  started_at: string;
  kwh_delivered: string | number;
  cost: string | number;
  soc_end: string | number | null;
  peak_power_kw: string | number;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const connectorId = parseInt(id, 10);
    if (isNaN(connectorId)) {
      return NextResponse.json({ error: 'Invalid connector ID' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: connector, error: dbError } = await supabase
      .from('connectors')
      .select(
        'id, station_id, charger_id, status, current_power_kw, last_seen, charging_sessions(id, status, started_at, kwh_delivered, cost, soc_end, peak_power_kw)'
      )
      .eq('id', connectorId)
      .single();

    if (dbError || !connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 });
    }

    const sessions = (connector.charging_sessions ?? []) as ActiveSessionRow[];
    const active = sessions.find((s) => s.status === 'ACTIVE') ?? null;

    const activeSession = active
      ? {
          session_id: active.id,
          started_at: active.started_at,
          duration_minutes: Math.max(
            0,
            Math.round((Date.now() - new Date(active.started_at).getTime()) / 60000)
          ),
          kwh_delivered: Number(active.kwh_delivered ?? 0),
          current_power_kw: Number(connector.current_power_kw ?? 0),
          soc: active.soc_end != null ? Number(active.soc_end) : null,
          cost: Number(active.cost ?? 0),
        }
      : null;

    return NextResponse.json({
      connector_id: connector.id,
      station_id: connector.station_id,
      charger_id: connector.charger_id,
      status: connector.status,
      current_power_kw: Number(connector.current_power_kw ?? 0),
      last_seen: connector.last_seen,
      active_session: activeSession,
    });
  } catch (err: unknown) {
    console.error('Unexpected error in /api/connectors/[id]/live:', err);
    return NextResponse.json(
      { error: 'Internal server error while fetching connector status' },
      { status: 500 }
    );
  }
}
