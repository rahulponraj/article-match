"use client";
import { useEffect, useState } from "react";
import { authFetch } from "@/lib/supabase";

export default function AiSettings() {
  const [info, setInfo] = useState<any>(null);
  const [url, setUrl] = useState(""); const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");

  async function check(initial = false) {
    setBusy(true);
    try { const d = await authFetch("/api/admin/settings"); setInfo(d); if (initial) setUrl(d.url || ""); }
    catch (e: any) { setMsg(e.message); }
    setBusy(false);
  }
  useEffect(() => { check(true); const t = setInterval(() => check(false), 30000); return () => clearInterval(t); }, []);

  async function save(extra: any = {}) {
    setBusy(true); setMsg("");
    try {
      const d = await authFetch("/api/admin/settings", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ai_service_url: url, internal_api_key: key, ...extra }),
      });
      setInfo(d); setKey(""); setUrl(d.url || "");
      setMsg(d.reachable && d.keyOk ? "Saved. The app is now connected." : "Saved, but the connection test failed. See the status above.");
    } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  }

  const ok = info?.reachable && info?.keyOk;
  const state = !info ? ["Checking...", "bg-line"] : ok ? [`Connected (${info.ms} ms), key accepted`, "bg-good"]
    : info.reachable ? ["Reachable, but the key is rejected", "bg-warn"] : ["Not reachable", "bg-signal"];

  return (
    <section>
      <h2 className="text-lg font-bold">AI service connection</h2>
      <div className="mt-3 rounded-lg border border-line bg-white p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold"><span className={`inline-block h-3 w-3 rounded-full ${state[1]}`} />{state[0]}</p>
        {info && !ok && info.error && <p className="mt-1 text-signal">{info.error}</p>}
        {info && <p className="mt-1 text-ink/60">Address from {info.urlFrom}, key from {info.keyFrom} ({info.keyLength} characters)</p>}
        <label className="mt-4 block font-medium">AI service address
          <input className="input mt-1" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://something.trycloudflare.com" /></label>
        <label className="mt-3 block font-medium">New key (leave empty to keep the current one)
          <input className="input mt-1" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} /></label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy || !url.trim()} onClick={() => save()}>Save and test</button>
          <button className="btn-ghost" disabled={busy} onClick={() => check(false)}>Test connection</button>
          <button className="btn-ghost" disabled={busy} onClick={() => { if (confirm("Go back to the values set in Vercel?")) save({ reset_to_environment: true }); }}>Use Vercel values</button>
        </div>
        {msg && <p role="status" className="mt-2">{msg}</p>}
        <p className="mt-3 text-xs text-ink/60">Changes apply within about 10 seconds. No redeploy is needed.</p>
      </div>
    </section>
  );
}
