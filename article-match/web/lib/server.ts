import { createClient } from "@supabase/supabase-js";

export const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function requireUser(req: Request, role?: "admin") {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const db = admin();
  const { data } = await db.auth.getUser(token);
  if (!data.user) throw new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  const { data: p } = await db.from("profiles").select("role").eq("id", data.user.id).single();
  if (role && p?.role !== role) throw new Response(JSON.stringify({ error: "Admins only" }), { status: 403 });
  return data.user;
}

// ---- AI service address + key: database first, Vercel env vars as fallback ----
type Cfg = { at: number; url: string; key: string; urlFrom: string; keyFrom: string };
let cache: Cfg | null = null;
export const resetAiConfigCache = () => { cache = null; };

export async function getAiConfig(force = false): Promise<Cfg> {
  if (!force && cache && Date.now() - cache.at < 10000) return cache;
  let url = process.env.AI_SERVICE_URL || "", key = process.env.INTERNAL_API_KEY || "";
  let urlFrom = "environment", keyFrom = "environment";
  try {
    const { data } = await admin().from("app_settings").select("key,value").in("key", ["ai_service_url", "internal_api_key"]);
    for (const r of data || []) {
      if (r.key === "ai_service_url" && r.value) { url = r.value; urlFrom = "database"; }
      if (r.key === "internal_api_key" && r.value) { key = r.value; keyFrom = "database"; }
    }
  } catch { /* table missing or database hiccup: fall back to env vars */ }
  cache = { at: Date.now(), url: url.trim().replace(/\/+$/, ""), key: key.trim(), urlFrom, keyFrom };
  return cache;
}

export async function ai(path: string, init: RequestInit = {}) {
  const send = (c: Cfg) => fetch(c.url + path, {
    ...init,
    headers: { ...(init.headers || {}), "x-internal-key": c.key },
    signal: AbortSignal.timeout(55000),
  });
  const c = await getAiConfig();
  try {
    return await send(c);
  } catch (e) {
    // Could not connect: maybe the address was just changed. Reload settings and retry once if different.
    const fresh = await getAiConfig(true);
    if (fresh.url !== c.url || fresh.key !== c.key) return await send(fresh);
    throw e;
  }
}
