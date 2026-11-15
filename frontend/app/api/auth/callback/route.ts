import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const oauthError = searchParams.get('error');
  const oauthErrorDescription = searchParams.get('error_description');

  // Supabase redirects here with ?error=… when the OAuth provider or the
  // redirect configuration rejects the flow. Surface a readable reason.
  if (oauthError) {
    const message = encodeURIComponent(
      oauthErrorDescription || `Google sign-in failed: ${oauthError}`
    );
    return NextResponse.redirect(`${origin}/?auth_error=${message}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv = process.env.NODE_ENV === 'development';
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
    console.error('Supabase code exchange failed:', error.message);
    // Surface the exchange failure reason to the UI (shown on the login
    // screen) instead of leaving only a server-side log.
    return NextResponse.redirect(
      `${origin}/?auth_error=${encodeURIComponent(`could_not_authenticate: ${error.message}`)}`
    );
  }

  // No code at all — Supabase never reached us with an authorization code.
  return NextResponse.redirect(
    `${origin}/?auth_error=${encodeURIComponent('could_not_authenticate: no authorization code was returned by the provider')}`
  );
}
