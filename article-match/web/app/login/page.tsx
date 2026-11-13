"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
export default function Login() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in"); const [msg, setMsg] = useState("");
  async function go(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    const { error } = mode === "in" ? await supabase.auth.signInWithPassword({ email, password }) : await supabase.auth.signUp({ email, password });
    if (error) return setMsg(error.message);
    if (mode === "up") return setMsg("Account created. Check your email if confirmation is on, then sign in.");
    location.href = "/";
  }
  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="text-2xl font-bold">Is this article already in stock?</h1>
      <p className="mt-2 text-sm text-ink/70">Sign in to check a photo against the Jogger catalogue.</p>
      <form onSubmit={go} className="mt-6 space-y-3">
        <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
        <button className="btn-primary w-full">{mode === "in" ? "Sign in" : "Create account"}</button>
        {msg && <p role="alert" className="text-sm text-signal">{msg}</p>}
      </form>
      <button className="mt-4 text-sm underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "Need an account? Create one" : "Have an account? Sign in"}
      </button>
    </main>
  );
}
