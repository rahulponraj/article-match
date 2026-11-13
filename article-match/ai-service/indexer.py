"""Sync JoggerCo catalogue -> Supabase and (re)build embeddings incrementally."""
import os, io, time, traceback
import httpx
from PIL import Image
import pipeline
from db import sb

BASE = os.environ.get("JOGGERCO_API_BASE_URL", "https://api.joggerco.cloud/api/v1")
ASSET = os.environ.get("JOGGERCO_ASSET_DOMAIN", "https://api.joggerco.cloud")

class Job:
    def __init__(self):
        self.id = sb.table("sync_jobs").insert({"status": "running"}).execute().data[0]["id"]
        self.buf, self.vals = [], {"total": 0, "done": 0, "failed": 0}
    def log(self, m):
        self.buf.append(f"[{time.strftime('%H:%M:%S')}] {m}"); self.flush()
    def flush(self, **extra):
        sb.table("sync_jobs").update({**self.vals, **extra, "log": "\n".join(self.buf[-300:])}).eq("id", self.id).execute()

def _find_token(d):
    """Look for a token key anywhere in the login response."""
    if isinstance(d, dict):
        for k in ("token", "access_token", "accessToken", "jwt", "idToken"):
            if isinstance(d.get(k), str) and d[k]:
                return d[k]
        for v in d.values():
            t = _find_token(v)
            if t: return t
    return None

def _shape(d):
    """Keys only, never values, so nothing secret reaches the log."""
    return {k: _shape(v) for k, v in d.items()} if isinstance(d, dict) else type(d).__name__

def _login(c):
    r = c.post(f"{BASE}/auth/login", json={"email": os.environ["JOGGERCO_API_EMAIL"], "password": os.environ["JOGGERCO_API_PASSWORD"]})
    r.raise_for_status(); d = r.json()
    t = _find_token(d)
    if not t:
        msg = d.get("message") if isinstance(d, dict) and isinstance(d.get("message"), str) else ""
        raise RuntimeError(f"No token in login response. Message: {msg!r}. Response shape: {_shape(d)}")
    return t

def _get(c, path, hdr):
    r = c.get(f"{BASE}{path}", headers=hdr)
    if r.status_code == 401:  # token expired: log in again once
        hdr["Authorization"] = f"Bearer {_login(c)}"; r = c.get(f"{BASE}{path}", headers=hdr)
    r.raise_for_status(); d = r.json()
    return d if isinstance(d, list) else d.get("data") or d.get("categories") or d.get("products") or []

def run_sync(force=False):
    job = Job()
    try:
        with httpx.Client(timeout=30) as c:
            hdr = {"Accept": "application/json", "Authorization": f"Bearer {_login(c)}"}
            items = {}
            for cat in _get(c, "/categories", hdr):
                prods = _get(c, f"/catalogue/categories/{cat['slug']}", hdr)
                job.log(f"{cat['slug']}: {len(prods)} products")
                for p in prods:
                    if p.get("photoUrl"): items[p["id"]] = p
            existing = {r["id"]: r for r in sb.table("products").select("id,indexed_photo_url,indexed_at").limit(100000).execute().data}
            rows = [{"id": i, "article": p["article"], "colour": p.get("colour"), "category": p.get("category"),
                     "category_slug": p.get("categorySlug"), "photo_url": p["photoUrl"]} for i, p in items.items()]
            for i in range(0, len(rows), 200):
                sb.table("products").upsert(rows[i:i + 200]).execute()
            gone = [i for i in existing if i not in items]
            for i in range(0, len(gone), 100):
                sb.table("products").delete().in_("id", gone[i:i + 100]).execute()
            job.log(f"catalogue: {len(items)} products, {len(gone)} removed")
            todo = [p for i, p in items.items() if force or not existing.get(i, {}).get("indexed_at")
                    or existing[i].get("indexed_photo_url") != p["photoUrl"]]
            job.vals["total"] = len(todo); job.flush()
            for p in todo:
                try:
                    url = p["photoUrl"] if p["photoUrl"].startswith("http") else ASSET + p["photoUrl"]
                    img = Image.open(io.BytesIO(c.get(url).content))
                    feats = pipeline.embed(pipeline.extract_shoes(pipeline.remove_bg(img), multi=True))
                    sb.table("product_embeddings").delete().eq("product_id", p["id"]).execute()
                    sb.table("product_embeddings").insert([
                        {"product_id": p["id"], "region": k, "embedding": "[" + ",".join(f"{x:.6f}" for x in f["g"]) + "]",
                         "grid": f["grid"], "hist": f["hist"]} for k, f in enumerate(feats)]).execute()
                    sb.table("products").update({"indexed_at": "now()", "indexed_photo_url": p["photoUrl"]}).eq("id", p["id"]).execute()
                    job.vals["done"] += 1
                except Exception as e:
                    job.vals["failed"] += 1; job.log(f"FAILED {p['article']}_{p.get('colour')}: {e}")
                if (job.vals["done"] + job.vals["failed"]) % 10 == 0: job.flush()
        job.log("sync finished"); job.flush(status="done", finished_at="now()")
    except Exception:
        job.log(traceback.format_exc()); job.flush(status="failed", finished_at="now()")
