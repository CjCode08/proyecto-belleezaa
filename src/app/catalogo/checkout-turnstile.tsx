"use client";

import Script from "next/script";
import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: {
        sitekey: string;
        action: string;
        callback: (token: string) => void;
        "expired-callback": () => void;
        "error-callback": () => void;
      }) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}

class VerificationBoundary extends Component<{ children: ReactNode; onToken: (token: string) => void }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onToken("");
    console.error("No se pudo iniciar la verificación de checkout. Revisa la clave pública de Turnstile.");
  }

  render() {
    return this.state.failed
      ? <p role="alert" className="mt-4 text-sm text-red-700">No se pudo iniciar la verificación. Revisa la clave pública de Turnstile en la configuración local.</p>
      : this.props.children;
  }
}

type Props = {
  siteKey: string;
  onToken: (token: string) => void;
  resetCount: number;
};

export function CheckoutTurnstile(props: Props) {
  if (!/^[A-Za-z0-9_-]+$/.test(props.siteKey)) {
    return <p role="alert" className="mt-4 text-sm text-red-700">La clave pública de Turnstile tiene un formato inválido. Revisa la configuración local.</p>;
  }
  return <VerificationBoundary onToken={props.onToken}><TurnstileWidget {...props} /></VerificationBoundary>;
}

function TurnstileWidget({ siteKey, onToken, resetCount }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const clearToken = useCallback(() => onToken(""), [onToken]);

  useEffect(() => {
    const turnstile = window.turnstile;
    if (!ready || !turnstile || !container.current) return;
    const id = turnstile.render(container.current, {
      sitekey: siteKey,
      action: "checkout",
      callback: onToken,
      "expired-callback": clearToken,
      "error-callback": () => { clearToken(); setError("No se pudo completar la verificación. Recarga la página."); },
    });
    widget.current = id;
    return () => { clearToken(); turnstile.remove(id); widget.current = null; };
  }, [ready, siteKey, onToken, clearToken]);
  useEffect(() => {
    if (resetCount && widget.current && window.turnstile) window.turnstile.reset(widget.current);
  }, [resetCount]);

  return <>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      onReady={() => setReady(true)} onError={() => setError("No se pudo cargar la verificación. Recarga la página.")} />
    <div ref={container} className="mt-4" />
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </>;
}
