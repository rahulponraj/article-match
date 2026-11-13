"use client";
import { useEffect, useRef, useState } from "react";
import Nav from "@/components/Nav";
import { supabase, authFetch, shrink, b64ToBlob, imgUrl } from "@/lib/supabase";
import { useProfile } from "@/lib/useProfile";

const STEPS = [
  ["Uploading", "Uploading image..."],
  ["Background removal", "Removing background and isolating the shoe..."],
  ["Feature extraction", "Generating image features..."],
  ["Search and ranking", "Finding candidates, comparing against inventory, scoring..."],
  ["Completion", "Displaying results..."],
];
const BAND = {
  exists: { label: "This article already exists in inventory", cls: "border-good bg-good/10 text-good" },
  possible: { label: "Possible match. Please verify against the cards below", cls: "border-warn bg-warn/10 text-warn" },
  new: { label: "No similar article found. This product may be new to the inventory.", cls: "border-signal bg-signal/10 text-signal" },
} as any;

export default function Search() {
  const { profile } = useProfile();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [cats, setCats] = useState<{ slug: string; name: string }[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [category, setCategory] = useState(""); const [colour, setColour] = useState("");
  const [stage, setStage] = useState(-1); const [error, setError] = useState("");
  const [imgs, setImgs] = useState<{ nobg?: string; final?: string }>({});
  const [res, setRes] = useState<any>(null); const [historyId, setHistoryId] = useState<string>();
  const [votes, setVotes] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState(false);
  const camRef = useRef<HTMLInputElement>(null); const fileRef = useRef<HTMLInputElement>(null);
  const busy = stage >= 0 && stage < 4;

  useEffect(() => {
    supabase.from("products").select("category,category_slug,colour").limit(5000).then(({ data }) => {
      const c = new Map<string, string>(); const k = new Set<string>();
      (data || []).forEach((r: any) => { if (r.category_slug) c.set(r.category_slug, r.category); if (r.colour) k.add(r.colour); });
      setCats([...c].map(([slug, name]) => ({ slug, name })).sort((a, b) => a.name.localeCompare(b.name)));
      setCols([...k].sort());
    });
  }, []);

  function pick(f?: File | null) {
    if (!f || !f.type.startsWith("image/")) return;
    setFile(f); setPreview(URL.createObjectURL(f)); setRes(null); setImgs({}); setError(""); setStage(-1); setVotes({});
  }

  async function run() {
    if (!file || !profile) return;
    const t0 = performance.now(); setError(""); setRes(null); setImgs({}); setVotes({}); setHistoryId(undefined);
    try {
      setStage(0);
      const small = await shrink(file);
      const path = `${profile.id}/${Date.now()}.jpg`;
      await supabase.storage.from("uploads").upload(path, small, { contentType: "image/jpeg" });

      setStage(1);
      const fd = new FormData(); fd.append("file", small, "query.jpg");
      const pre = await authFetch("/api/ai/preprocess", { method: "POST", body: fd });
      setImgs(pre);

      setStage(2);
      const fd2 = new FormData(); fd2.append("file", await b64ToBlob(pre.final), "final.png");
      const emb = await authFetch("/api/ai/embed", { method: "POST", body: fd2 });

      setStage(3);
      const m = await authFetch("/api/ai/match", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ variants: emb.variants, category: category || null, colour: colour || null }),
      });
      const ms = Math.round(performance.now() - t0);
      setRes(m); setStage(4);
      const { data } = await supabase.from("match_history").insert({
        user_id: profile.id, image_path: path, category: category || null, colour: colour || null, band: m.band,
        top_score: m.top_score, duration_ms: ms, widened: m.widened, results: m.results.slice(0, 10),
      }).select("id").single();
      setHistoryId(data?.id);
    } catch (e: any) { setError(e.message || "Something went wrong"); setStage(-1); }
  }

  async function vote(productId: string, correct: boolean) {
    if (!historyId || !profile) return;
    setVotes((v) => ({ ...v, [productId]: correct }));
    await supabase.from("feedback").insert({ history_id: historyId, product_id: productId, correct, user_id: profile.id });
  }

  const top = res?.results?.slice(0, 10) || []; const rest = res?.results?.slice(10) || [];
  return (
    <>
      <Nav role={profile?.role} email={profile?.email} />
      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[340px_1fr]">
        <section className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
            className={`flex aspect-square items-center justify-center rounded-lg border-2 border-dashed bg-white p-3 text-center ${drag ? "border-signal" : "border-line"}`}>
            {preview ? <img src={preview} alt="Uploaded article" className="max-h-full max-w-full rounded object-contain" />
              : <p className="text-sm text-ink/60">Drop a photo of the shoe here, or use the buttons below.</p>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <div className="flex gap-2">
            <button className="btn-ghost flex-1" onClick={() => fileRef.current?.click()}>Choose image</button>
            <button className="btn-ghost flex-1" onClick={() => camRef.current?.click()}>Take photo</button>
          </div>
          <label className="block text-sm font-medium">Category (optional)
            <select className="input mt-1" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Any category</option>{cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select></label>
          <label className="block text-sm font-medium">Colour (optional)
            <select className="input mt-1" value={colour} onChange={(e) => setColour(e.target.value)}>
              <option value="">Any colour</option>{cols.map((c) => <option key={c}>{c}</option>)}
            </select></label>
          <button className="btn-primary w-full py-3" disabled={!file || busy || !profile} onClick={run}>
            {busy ? "Checking..." : "Check inventory"}</button>
          {error && <p role="alert" className="rounded-md border border-signal bg-signal/10 p-3 text-sm text-signal">{error}</p>}
        </section>

        <section className="space-y-6">
          {stage >= 0 && (
            <div aria-live="polite" className="rounded-lg border border-line bg-white p-4">
              <div className="h-2 overflow-hidden rounded bg-line"><div className="h-full bg-signal transition-all duration-500" style={{ width: `${Math.min(stage + 1, 5) * 20}%` }} /></div>
              <ol className="mt-3 space-y-1 text-sm">
                {STEPS.map(([name, msg], i) => (
                  <li key={name} className={i < stage || stage === 4 ? "text-good" : i === stage ? "font-semibold" : "text-ink/40"}>
                    {i < stage || stage === 4 ? "Done: " : ""}{i === stage && stage < 4 ? msg : name}</li>))}
              </ol>
            </div>)}

          {(preview && (imgs.final || busy)) && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">What the AI is analysing</h2>
              <div className="grid grid-cols-3 gap-3">
                {[["Uploaded", preview], ["Background removed", imgs.nobg && `data:image/png;base64,${imgs.nobg}`], ["Used for matching", imgs.final && `data:image/png;base64,${imgs.final}`]].map(([t, src]: any) => (
                  <figure key={t}>{src ? <img src={src} alt={t} className="aspect-square w-full rounded-md border border-line bg-[repeating-conic-gradient(#e8eae6_0_25%,#fff_0_50%)] bg-[length:16px_16px] object-contain" /> : <div className="skeleton aspect-square" />}
                    <figcaption className="mt-1 text-xs text-ink/60">{t}</figcaption></figure>))}
              </div>
            </div>)}

          {busy && stage >= 3 && <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-32" />)}</div>}

          {res && (
            <>
              <div className={`rounded-lg border-l-4 p-4 font-semibold ${BAND[res.band].cls}`}>{BAND[res.band].label}
                {res.widened && <p className="mt-1 text-sm font-normal">Nothing close in the chosen category or colour, so the whole catalogue was searched.</p>}</div>
              {top.length > 0 && <h2 className="text-sm font-semibold">{res.band === "new" ? "Closest articles (low similarity)" : "Closest articles"}</h2>}
              <div className="grid gap-4 sm:grid-cols-2">
                {top.map((r: any, i: number) => (
                  <article key={r.id} className="flex gap-3 rounded-lg border border-line bg-white p-3">
                    <img src={imgUrl(r.photo_url)} alt={`${r.article} ${r.colour}`} className="h-28 w-24 rounded object-contain bg-paper" loading="lazy" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="text-2xl font-bold">{r.percent}%</p>
                      <p className="font-semibold">Article {r.article}</p>
                      <p className="truncate text-ink/70">{r.category} / {r.colour}</p>
                      <p className="text-xs text-ink/50">Rank {i + 1}, raw score {r.score}</p>
                      <div className="mt-2 flex gap-2">
                        <button disabled={!historyId} className={`btn-ghost !px-2 !py-1 ${votes[r.id] === true ? "!border-good !text-good" : ""}`} onClick={() => vote(r.id, true)}>Correct</button>
                        <button disabled={!historyId} className={`btn-ghost !px-2 !py-1 ${votes[r.id] === false ? "!border-signal !text-signal" : ""}`} onClick={() => vote(r.id, false)}>Incorrect</button>
                      </div>
                    </div>
                  </article>))}
              </div>
              {rest.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-line bg-white">
                  <table className="w-full text-left text-sm"><thead className="border-b border-line"><tr><th className="p-2">Article</th><th>Colour</th><th>Category</th><th>Match</th></tr></thead>
                    <tbody>{rest.map((r: any) => <tr key={r.id} className="border-b border-line/60"><td className="p-2">{r.article}</td><td>{r.colour}</td><td>{r.category}</td><td>{r.percent}%</td></tr>)}</tbody></table>
                </div>)}
            </>)}
        </section>
      </main>
    </>
  );
}
