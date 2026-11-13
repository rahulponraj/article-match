import os, io, threading
from fastapi import FastAPI, UploadFile, File, Header, HTTPException, Depends
from pydantic import BaseModel
from PIL import Image, ImageOps
import numpy as np
import pipeline, indexer
from db import sb

app = FastAPI(title="Article Match AI service")
# Score cut-offs. Defaults are starting points: tune with evaluate.py and the feedback table.
EXISTS_T = float(os.environ.get("EXISTS_THRESHOLD", 0.86))
POSSIBLE_T = float(os.environ.get("POSSIBLE_THRESHOLD", 0.72))
WIDEN_T = float(os.environ.get("WIDEN_THRESHOLD", 0.70))

def auth(x_internal_key: str = Header("")):
    if x_internal_key != os.environ["INTERNAL_API_KEY"]: raise HTTPException(401, "bad key")

@app.get("/health")
def health(): return {"ok": True}

@app.post("/preprocess", dependencies=[Depends(auth)])
async def preprocess(file: UploadFile = File(...)):
    rgba = pipeline.remove_bg(Image.open(io.BytesIO(await file.read())))
    final = pipeline.extract_shoes(rgba, multi=False)[0]
    return {"nobg": pipeline.to_b64(rgba), "final": pipeline.to_b64(final)}

@app.post("/embed", dependencies=[Depends(auth)])
async def embed(file: UploadFile = File(...)):
    img = Image.open(io.BytesIO(await file.read())).convert("RGB")
    # mirrored variant too: a shoe photographed facing the other way should still match
    return {"variants": pipeline.embed([img, ImageOps.mirror(img)])}

class MatchReq(BaseModel):
    variants: list[dict]
    category: str | None = None
    colour: str | None = None

def _retrieve(variants, cat, col, k=60):
    """Vector search per variant, then re-rank with grid + colour features. Returns {product_id: score}."""
    best = {}
    for v in variants:
        q = "[" + ",".join(f"{x:.6f}" for x in v["g"]) + "]"
        for r in sb.rpc("match_embeddings", {"q": q, "k": k, "cat": cat, "col": col}).execute().data:
            gr = float(np.dot(v["grid"], r["grid"]))
            h = float(np.minimum(v["hist"], r["hist"]).sum())
            s = 0.6 * float(r["sim"]) + 0.25 * gr + 0.15 * h
            if s > best.get(r["product_id"], -1): best[r["product_id"]] = s
    return best

@app.post("/match", dependencies=[Depends(auth)])
def match(req: MatchReq):
    cat, col = req.category or None, req.colour or None
    best = _retrieve(req.variants, cat, col)
    widened = False
    # filters are soft: a wrong category must not hide the real match
    if (cat or col) and (not best or max(best.values()) < WIDEN_T):
        best, widened = _retrieve(req.variants, None, None), True
    ranked = sorted(best.items(), key=lambda kv: -kv[1])[:25]
    prods = {}
    if ranked:
        for r in sb.table("products").select("*").in_("id", [i for i, _ in ranked]).execute().data: prods[r["id"]] = r
    results = [{"id": i, "score": round(s, 4), "percent": round(float(np.clip((s - 0.40) / 0.55, 0, 1)) * 100, 1),
                "article": prods[i]["article"], "colour": prods[i]["colour"], "category": prods[i]["category"],
                "photo_url": prods[i]["photo_url"]} for i, s in ranked if i in prods]
    top = results[0]["score"] if results else 0
    band = "exists" if top >= EXISTS_T else "possible" if top >= POSSIBLE_T else "new"
    return {"band": band, "top_score": top, "widened": widened, "results": results}

@app.post("/admin/sync", dependencies=[Depends(auth)])
def sync(force: bool = False):
    if sb.table("sync_jobs").select("id").eq("status", "running").execute().data:
        raise HTTPException(409, "A sync is already running")
    threading.Thread(target=indexer.run_sync, args=(force,), daemon=True).start()
    return {"started": True, "force": force}
