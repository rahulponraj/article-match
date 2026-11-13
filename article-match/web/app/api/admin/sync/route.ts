import { NextResponse } from "next/server";
import { requireUser, ai } from "@/lib/server";
export async function POST(req: Request) {
  try {
    await requireUser(req, "admin");
    const force = new URL(req.url).searchParams.get("force") === "true";
    const r = await ai(`/admin/sync?force=${force}`, { method: "POST" });
    const body = await r.json().catch(() => ({}));
    return NextResponse.json(r.ok ? body : { error: body.detail || "Could not start sync" }, { status: r.status });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "AI service unreachable" }, { status: 502 });
  }
}
