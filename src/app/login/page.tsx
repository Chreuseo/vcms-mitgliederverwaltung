"use client";
import React, { useEffect, useState } from "react";
import { getProviders, signIn, type ClientSafeProvider } from "next-auth/react";

export default function LoginPage() {
  const [providers, setProviders] = useState<Record<string, ClientSafeProvider> | null>(null);

  useEffect(() => {
    let mounted = true;
    getProviders()
      .then((p) => {
        if (mounted) setProviders(p || null);
      })
      .catch(() => {
        if (mounted) setProviders(null);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const hasKeycloak = Boolean(providers?.keycloak);

  return (
    <div className="mx-auto max-w-md">
      <form
        className="rounded-lg border border-black/10 dark:border-white/10 p-6 bg-white/70 dark:bg-black/30 backdrop-blur"
        onSubmit={(e) => {
          e.preventDefault();
          signIn("keycloak", { callbackUrl: "/" });
        }}
      >
        <h1 className="text-2xl font-semibold">Login</h1>
        <label className="block mt-4">
          <span className="text-sm text-foreground/80">Mit Keycloak anmelden</span>
        </label>

        <button
          className="mt-5 w-full text-sm rounded-md border border-black/10 dark:border-white/20 px-4 py-2 hover:bg-black/5 dark:hover:bg-white/10"
          type="submit"
        >
          Anmelden mit Keycloak
        </button>

        {!hasKeycloak && (
          <div className="mt-4 text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md p-3">
            Keycloak-Provider nicht gefunden — versuche es später erneut.
          </div>
        )}
      </form>
    </div>
  );
}