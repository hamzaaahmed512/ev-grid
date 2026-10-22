'use client';

import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';

type GoogleIdentity = {
  initialize(options: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    auto_select: boolean;
  }): void;
  renderButton(element: HTMLElement, options: {
    type: string; theme: string; size: string; text: string;
    shape: string; width: number;
  }): void;
};

const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();

export default function GoogleSignIn({ onCredential, disabled }: {
  onCredential: (credential: string) => Promise<void>;
  disabled: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const busy = useRef(disabled);
  callback.current = onCredential;
  busy.current = disabled;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!ready || !clientId || !container.current) return;
    const identity = (window as Window & {
      google?: { accounts: { id: GoogleIdentity } };
    }).google?.accounts.id;
    if (!identity) { setFailed(true); return; }
    identity.initialize({
      client_id: clientId,
      auto_select: false,
      callback: ({ credential }) => {
        if (!busy.current) {
          busy.current = true;
          void callback.current(credential).finally(() => { busy.current = false; });
        }
      },
    });
    identity.renderButton(container.current, {
      type: 'standard', theme: 'outline', size: 'large',
      text: 'continue_with', shape: 'rectangular',
      width: Math.min(400, container.current.clientWidth),
    });
    const element = container.current;
    return () => element.replaceChildren();
  }, [ready]);

  return <div className="google-sign-in">
    {clientId && <Script
      src="https://accounts.google.com/gsi/client"
      strategy="afterInteractive"
      onReady={() => setReady(true)}
      onError={() => setFailed(true)}
    />}
    {clientId && !failed ? <>
      <div ref={container} className="google-button-container" inert={disabled} aria-busy={disabled}/>
      {!ready && <p className="small-note" role="status">Loading Google sign-in…</p>}
    </> : <>
      <button type="button" className="btn btn-outline full" disabled>Continue with Google</button>
      <p className="small-note" role="status">{failed
        ? 'Google sign-in could not load. Please reload or use email below.'
        : 'Google sign-in is not available yet. Please use email below.'}</p>
    </>}
    <div className="auth-divider"><span>or continue with email</span></div>
  </div>;
}
