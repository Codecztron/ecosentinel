"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/config";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface AuthGateProps {
  children: React.ReactNode;
}

/**
 * Protects the live dashboard with the Supabase operator session. The database
 * policies intentionally permit reads and updates only for authenticated users.
 */
export function AuthGate({ children }: AuthGateProps) {
  const supabaseRef = useRef(isSupabaseConfigured ? createClient() : null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const supabase = supabaseRef.current!;
    let active = true;

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      setSession(data.session);
      setError(sessionError?.message ?? null);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const { error: signInError } = await supabaseRef.current!.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) setError(signInError.message);
    setIsSubmitting(false);
  }

  if (!isSupabaseConfigured) return <>{children}</>;

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canopy-900">
        <LoadingSpinner label="Checking operator session…" />
      </main>
    );
  }

  if (session) return <>{children}</>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-canopy-900 p-6">
      <form
        onSubmit={handleSignIn}
        className="w-full max-w-sm rounded-lg border border-canopy-600 bg-canopy-800 p-6 shadow-2xl"
      >
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-signal-green">EcoSentinel</p>
        <h1 className="mt-2 text-xl font-semibold text-canopy-100">Operator sign in</h1>
        <p className="mt-2 text-sm text-canopy-300">
          Sign in with an operator account created in your Supabase project.
        </p>

        <label className="mt-5 block font-mono text-xs text-canopy-300" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          className="mt-1.5 w-full rounded border border-canopy-600 bg-canopy-900 px-3 py-2 text-sm text-canopy-100 outline-none focus:border-signal-gold"
        />

        <label className="mt-4 block font-mono text-xs text-canopy-300" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          className="mt-1.5 w-full rounded border border-canopy-600 bg-canopy-900 px-3 py-2 text-sm text-canopy-100 outline-none focus:border-signal-gold"
        />

        {error && <p className="mt-4 rounded bg-signal-red/15 p-2 text-sm text-signal-red">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-5 w-full rounded bg-canopy-100 px-3 py-2 font-mono text-sm font-medium text-canopy-950 transition hover:bg-white disabled:opacity-50"
        >
          {isSubmitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
