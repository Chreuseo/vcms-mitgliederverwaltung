"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useState, useEffect } from "react";

export default function Navbar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const isActive = (href: string) => pathname === href;

  const [theme, setTheme] = useState("light");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === "light" ? "dark" : "light"));
  };

  return (
    <header className="w-full border-b border-black/10 dark:border-white/10 bg-white/70 dark:bg-black/40 backdrop-blur sticky top-0 z-50">
      <nav className="mx-auto max-w-5xl px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            VCMS
          </Link>
          <Link
            href="/mitgliederliste"
            className={`text-sm hover:underline ${isActive("/mitgliederliste") ? "font-semibold" : "text-foreground/80"}`}
          >
            Mitgliederliste
          </Link>
          <Link
            href="/export"
            className={`text-sm hover:underline ${isActive("/export") ? "font-semibold" : "text-foreground/80"}`}
          >
            Export
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleTheme}
            className="text-sm rounded-md border border-black/10 dark:border-white/20 px-3 py-1 hover:bg-black/5 dark:hover:bg-white/10"
          >
            {theme === "light" ? "Dark Mode" : "Light Mode"}
          </button>
          {status === "loading" ? (
            <span className="text-sm text-foreground/70">…</span>
          ) : session ? (
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm rounded-md border border-black/10 dark:border-white/20 px-3 py-1 hover:bg-black/5 dark:hover:bg-white/10"
            >
              Logout
            </button>
          ) : (
            <Link
              href="/login"
              className="text-sm rounded-md border border-black/10 dark:border-white/20 px-3 py-1 hover:bg-black/5 dark:hover:bg-white/10"
            >
              Login
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
