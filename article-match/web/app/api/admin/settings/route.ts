import { NextResponse } from "next/server";
import { requireUser, admin, getAiConfig, resetAiConfigCache } from "@/lib/server";

async function probe(url: string, key: string) {
  const out: any = { reachable: false, keyOk: false, ms: null, error: null };
  const t = Date.now();
  try {
    const h = await fetch(url + "/health", { signal: AbortSignal.timeout(6000) });
    const j = await h.json().catch(() => null);
    out.ms = Date.now() - t;
    if (!h.ok || j?.ok !== true) { out.error = h.ok ? "Reached a server, but it is not the AI service" : `Server replied HTTP ${h.status}`; return out; }
    out.reachable = true;
    // empty match request: cheap way to verify the key (401 = wrong key)
    const m = await fetch(url + "/match", {
      method: "POST", headers: { "content-type": "application/json", "x-internal-key": key },
      body: JSON.stringify({ variants: [] }), signal: AbortSignal.timeout(6000),
    });
    out.keyOk = m.status !== 401;
    if (!out.keyOk) out.error = "The AI service rejected the key (bad key)";
  } catch {
    out.error = "Could not connect to that address";
  }
  return out;
}

async function summary() {
  const c = await getAiConfig(true);
  const check = c.url ? await probe(c.url, c.key) : { reachable: false, keyOk: false, ms: null, error: "No address set" };
  return { url: c.url, urlFrom: c.urlFrom, keyFrom: c.keyFrom, keyLength: c.key.length, ...check };
}

export async function GET(req: Request) {
  try { await requireUser(req, "admin"); return NextResponse.json(await summary()); }
  catch (e) { if (e instanceof Response) return e; return NextResponse.json({ error: "Could not check settings" }, { status: 500 }); }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req, "admin");
    const body = await req.json();
    const rows: any[] = [];
    if (typeof body.ai_service_url === "string" && body.ai_service_url.trim()) {
      const u = body.ai_service_url.trim().replace(/\/+$/, "");
      if (!/^https?:\/\/[^\s/]+$/.test(u) && !/^https?:\/\/[^\s/]+\/[^\s]*$/.test(u)) return NextResponse.json({ error: "Enter a full address starting with https://" }, { status: 400 });
      rows.push({ key: "ai_service_url", value: u });
    }
    if (typeof body.internal_api_key === "string" && body.internal_api_key.trim()) {
      rows.push({ key: "internal_api_key", value: body.internal_api_key.trim() });
    }
    if (body.reset_to_environment === true) {
      await admin().from("app_settings").delete().in("key", ["ai_service_url", "internal_api_key"]);
    } else if (rows.length) {
      const { error } = await admin().from("app_settings").upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString(), updated_by: user.email })));
      if (error) return NextResponse.json({ error: "Could not save. Did you run 002_settings.sql in Supabase?" }, { status: 500 });
    }
    resetAiConfigCache();
    return NextResponse.json(await summary());
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "Could not save settings" }, { status: 500 });
  }
}
