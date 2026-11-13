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
export const ai = (path: string, init: RequestInit = {}) =>
  fetch(process.env.AI_SERVICE_URL + path, { ...init, headers: { ...(init.headers || {}), "x-internal-key": process.env.INTERNAL_API_KEY! } });
