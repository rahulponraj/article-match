import { NextResponse } from "next/server";
import { requireUser, ai } from "@/lib/server";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: { step: string } }) {
  try {
    await requireUser(req);
    const { step } = params;
    if (!["preprocess", "embed", "match"].includes(step)) return NextResponse.json({ error: "Unknown step" }, { status: 404 });
    const init: RequestInit = step === "match"
      ? { method: "POST", headers: { "content-type": "application/json" }, body: await req.text() }
      : { method: "POST", body: await req.formData() };
    const r = await ai(`/${step}`, init);
    const text = await r.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch {}
    if (!body) return NextResponse.json({ error: `AI service replied ${r.status} with a non-JSON body: ${text.slice(0, 150)}` }, { status: 502 });
    return NextResponse.json(r.ok ? body : { error: typeof body.detail === "string" ? body.detail : body.error || "AI service error" }, { status: r.status });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json({ error: "AI service unreachable. An admin can fix the address under Admin > AI service connection." }, { status: 502 });
  }
}
