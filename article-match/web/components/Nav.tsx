"use client";
import { supabase } from "@/lib/supabase";
export default function Nav({ role, email }: { role?: string; email?: string }) {
  const link = "text-sm font-medium text-ink/70 hover:text-ink";
  return (
    <header className="border-b-2 border-signal bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <a href="/" className="text-lg font-bold tracking-tight">Article Match</a>
        <nav className="flex gap-5">
          <a href="/" className={link}>Search</a>
          <a href="/history" className={link}>History</a>
          {role === "admin" && <a href="/admin" className={link}>Admin</a>}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-ink/60">
          <span className="hidden sm:inline">{email}</span>
          <button className="btn-ghost" onClick={async () => { await supabase.auth.signOut(); location.href = "/login"; }}>Sign out</button>
        </div>
      </div>
    </header>
  );
}
