"use client";
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { supabase, imgUrl } from "@/lib/supabase";
import { useProfile } from "@/lib/useProfile";

export default function History() {
  const { profile } = useProfile();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const { data } = await supabase.from("match_history").select("*").order("created_at", { ascending: false }).limit(100);
      const { data: ps } = await supabase.from("profiles").select("id,email");
      const emails = Object.fromEntries((ps || []).map((p: any) => [p.id, p.email]));
      const withUrls = await Promise.all((data || []).map(async (r: any) => ({
        ...r, email: emails[r.user_id],
        url: r.image_path ? (await supabase.storage.from("uploads").createSignedUrl(r.image_path, 3600)).data?.signedUrl : null })));
      setRows(withUrls);
    })();
  }, [profile]);
  return (
    <>
      <Nav role={profile?.role} email={profile?.email} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-xl font-bold">Match history</h1>
        {rows.length === 0 && <p className="mt-4 text-sm text-ink/60">No searches yet. Run a check from the Search page.</p>}
        <div className="mt-4 space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="flex gap-4 rounded-lg border border-line bg-white p-3">
              {r.url && <img src={r.url} alt="Uploaded" className="h-24 w-24 rounded object-cover" />}
              <div className="flex-1 text-sm">
                <p className="font-semibold">{r.band === "exists" ? "Exists" : r.band === "possible" ? "Possible match" : "Likely new"}
                  <span className="ml-2 font-normal text-ink/60">{new Date(r.created_at).toLocaleString()} by {r.email || "unknown"}</span></p>
                <p className="text-ink/70">Top score {Number(r.top_score).toFixed(3)}, {r.duration_ms} ms{r.category ? `, category ${r.category}` : ""}{r.colour ? `, colour ${r.colour}` : ""}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(r.results || []).slice(0, 3).map((m: any) => (
                    <span key={m.id} className="flex items-center gap-2 rounded border border-line px-2 py-1">
                      <img src={imgUrl(m.photo_url)} alt="" className="h-8 w-8 object-contain" />{m.article} {m.colour}, {m.percent}%</span>))}
                </div>
              </div>
            </div>))}
        </div>
      </main>
    </>
  );
}
