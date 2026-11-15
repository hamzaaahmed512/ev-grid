import type { SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js';

/**
 * Resolve the Supabase Auth user to the application's `public.users` row.
 *
 * The vehicles / bookings / charging_sessions tables reference users(id)
 * (an integer) while Supabase Auth identities are UUIDs. A database trigger
 * (`handle_new_user`) provisions the row when a new auth user is created;
 * this helper resolves the link (and repairs it for pre-trigger accounts)
 * so API routes can scope data with `.eq('user_id', legacyUserId)`.
 */
export async function getLegacyUserId(
  supabase: SupabaseClient,
  user: SupabaseUser,
): Promise<number | null> {
  // 1. Direct link via supabase_uid (provisioned by the DB trigger)
  const direct = await supabase
    .from('users')
    .select('id')
    .eq('supabase_uid', user.id)
    .maybeSingle();

  if (direct.data?.id) return direct.data.id as number;

  const email = user.email?.trim().toLowerCase();
  if (!email) return null;

  // 2. Legacy row found by email — link it to the Supabase identity
  const byEmail = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (byEmail.data?.id) {
    await supabase.from('users').update({ supabase_uid: user.id }).eq('id', byEmail.data.id);
    return byEmail.data.id as number;
  }

  // 3. No row at all (e.g. trigger missing) — provision one now
  const metadata = user.user_metadata || {};
  const name = String(
    metadata.full_name || metadata.name || email.split('@')[0] || 'EV Driver',
  ).slice(0, 100);

  const inserted = await supabase
    .from('users')
    .insert({
      supabase_uid: user.id,
      email,
      name,
      password_hash: `supabase:${user.id}`,
    })
    .select('id')
    .single();

  if (!inserted.error && inserted.data?.id) return inserted.data.id as number;

  // Final retry in case a concurrent insert (trigger) won the race
  const retry = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  return (retry.data?.id as number) ?? null;
}
