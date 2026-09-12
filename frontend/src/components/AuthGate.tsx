"use client";

import React, { FormEvent, useState } from "react";
import { LoaderCircle, LogIn, ShieldCheck, UserCheck } from "lucide-react";

import { usePathname } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { firebaseIsConfigured } from "@/lib/firebase";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, user, signInWithEmail, signInWithGoogle, continueLocally } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Always allow public legal and governance pages without requiring authentication
  if (pathname === "/privacy" || pathname === "/terms") {
    return <>{children}</>;
  }

  // When Firebase is not configured (local dev, offline sovereign evaluation),
  // render the operations console directly without blocking.
  if (!firebaseIsConfigured || state === "configuration_required") {
    return <>{children}</>;
  }

  if (state === "loading") {
    return (
      <main className="auth-gate auth-gate--loading" aria-live="polite">
        <LoaderCircle className="auth-gate__spinner" size={28} /> Verifying secure session…
      </main>
    );
  }

  if (user) return <>{children}</>;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signInWithEmail(email.trim(), password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-gate">
      <section className="auth-gate__card" aria-labelledby="sign-in-title">
        <ShieldCheck size={28} aria-hidden="true" />
        <p className="auth-gate__eyebrow">SOLEN SECURE WORKSPACE</p>
        <h1 id="sign-in-title">Sign in to intelligence operations</h1>
        <p>Use the approved Firebase identity for your organization. Access is assigned per workspace.</p>
        <form onSubmit={submit} className="auth-gate__form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          {error && <p className="auth-gate__error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>
            {busy ? "Signing in…" : <><LogIn size={16} /> Sign in</>}
          </button>
        </form>
        <div className="auth-gate__divider"><span>or</span></div>
        <button
          type="button"
          className="auth-gate__secondary"
          onClick={() => void signInWithGoogle()}
          disabled={busy}
        >
          Continue with Google
        </button>
        <button
          type="button"
          className="auth-gate__secondary"
          style={{ marginTop: 8 }}
          onClick={() => continueLocally()}
          disabled={busy}
        >
          <UserCheck size={16} /> Continue as Local Analyst (Guest Mode)
        </button>
      </section>
    </main>
  );
}
