"use client";
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { supabase, authFetch } from "@/lib/supabase";
import { useProfile } from "@/lib/useProfile";

export default function Admin() {
  const { profile, loading } = useProfile();
  const [jobs, setJobs] = useState<any[]>([]); const [stats, setStats] = useState<any>({});
  const [users, setUsers] = useState<any[]>([]); const [msg, setMsg] = useState("");

  async function load() {
    const { data: j } = await supabase.from("sync_jobs").select("*").order("id", { ascending: false }).limit(5);
    setJobs(j || []);
    const { data: h } = await supabase.from("match_history").select("band,top_score,duration_ms,created_at").order("created_at", { ascending: false }).limit(1000);
    const { count: total } = await supabase.from("products").select("*", { count: "exact", head: true });
    const { count: indexed } = await supabase.from("products").select("*", { count: "exact", head: true }).not("indexed_at", "is", null);
    const { count: good } = await supabase.from("feedback").select("*", { count: "exact", head: true }).eq("correct", true);
    const { count: bad } = await supabase.from("feedback").select("*", { count: "exact", head: true }).eq("correct", false);
    const n = h?.length || 0, avg = (k: string) => (n ? (h!.reduce((s: number, r: any) => s + Number(r[k] || 0), 0) / n) : 0);
    const day = Date.now() - 864e5;
    setStats({ n, today: h?.filter((r: any) => +new Date(r.created_at) > day).length, ms: Math.round(avg("duration_ms")), score: avg("top_score").toFixed(3),
      exists: h?.filter((r: any) => r.band === "exists").length, possible: h?.filter((r: any) => r.band === "possible").length,
      isNew: h?.filter((r: any) => r.band === "new").length, total, indexed, good, bad });
    const { data: u } = await supabase.from("profiles").select("id,email,role").order("email");
    setUsers(u || []);
  }
  useEffect(() => { if (profile?.role === "admin") { load(); const t = setInterval(load, 5000); return () => clearInterval(t); } }, [profile]);

  async function sync(force: boolean) {
    setMsg("");
    try { await authFetch(`/api/admin/sync?force=${force}`, { method: "POST" }); setMsg(force ? "Full rebuild started." : "Sync started."); load(); }
    catch (e: any) { setMsg(e.message); }
  }
  async function setRole(id: string, role: string) { await supabase.from("profiles").update({ role }).eq("id", id); load(); }

  if (loading) return null;
  if (profile?.role !== "admin") return (<><Nav role={profile?.role} email={profile?.email} /><p className="p-8">This page is for admins.</p></>);
  const cell = (label: string, v: any) => (<div className="rounded-lg border border-line bg-white p-3"><p className="text-2xl font-bold">{v ?? 0}</p><p className="text-xs text-ink/60">{label}</p></div>);
  return (
    <>
      <Nav role={profile.role} email={profile.email} />
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8">
        <section>
          <h1 className="text-xl font-bold">Inventory index</h1>
          <p className="mt-1 text-sm text-ink/70">{stats.indexed ?? 0} of {stats.total ?? 0} products indexed.</p>
          <div className="mt-3 flex gap-2">
            <button className="btn-primary" onClick={() => sync(false)}>Sync new and changed</button>
            <button className="btn-ghost" onClick={() => { if (confirm("Re-process every image? This takes a while.")) sync(true); }}>Rebuild all</button>
          </div>
          {msg && <p className="mt-2 text-sm">{msg}</p>}
          <div className="mt-4 space-y-2">
            {jobs.map((j) => (
              <details key={j.id} className="rounded-lg border border-line bg-white p-3 text-sm" open={j.status === "running"}>
                <summary className="cursor-pointer font-medium">Job {j.id}: {j.status}, {j.done}/{j.total} done, {j.failed} failed, started {new Date(j.started_at).toLocaleString()}</summary>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs">{j.log}</pre>
              </details>))}
          </div>
        </section>
        <section>
          <h2 className="text-lg font-bold">Matching performance</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cell("searches (last 1000)", stats.n)}{cell("searches in 24 h", stats.today)}{cell("average duration, ms", stats.ms)}{cell("average top score", stats.score)}
            {cell("exists", stats.exists)}{cell("possible", stats.possible)}{cell("likely new", stats.isNew)}
            {cell("feedback: correct / incorrect", `${stats.good ?? 0} / ${stats.bad ?? 0}`)}
          </div>
        </section>
        <section>
          <h2 className="text-lg font-bold">Users</h2>
          <table className="mt-3 w-full max-w-xl text-left text-sm"><tbody>
            {users.map((u) => (<tr key={u.id} className="border-b border-line"><td className="py-2">{u.email}</td>
              <td><select className="input !w-auto" value={u.role} disabled={u.id === profile.id} onChange={(e) => setRole(u.id, e.target.value)}><option>staff</option><option>admin</option></select></td></tr>))}
          </tbody></table>
        </section>
      </main>
    </>
  );
}
