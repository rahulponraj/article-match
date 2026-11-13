# Article Match Engine

Checks whether a photographed footwear article already exists in the Jogger catalogue.

## 1. Architecture

```
 Browser (staff/admin)
   |  Supabase Auth JWT
   v
 Next.js on Vercel  ----------------------------->  Supabase
   UI + /api/ai/* proxy (verifies JWT, role)         Postgres + pgvector, Auth, private Storage
   |  x-internal-key                                   ^
   v                                                   |
 AI service (Docker, FastAPI)  -----------------------+
   rembg -> OpenCV shoe extraction -> DINOv2 -> pgvector search -> re-rank
   indexer: JoggerCo API -> products + embeddings
```
Vercel cannot run PyTorch (size, timeout, no disk), so the AI service is a separate container.
The browser calls `preprocess`, `embed`, `match` one after another, which drives the real progress bar and keeps every call under Vercel's limits.

## 2. AI matching
1. **Background removal**: rembg (ISNet), then connected-component analysis keeps the shoe and drops tags/floor noise.
2. **Normalise**: EXIF rotation, white square canvas, 224 px.
3. **Embedding**: DINOv2-base, CLS + mean patch (1536 dims, L2-normalised). Also a 2x2 grid of patch features and an HSV colour histogram.
4. **Catalogue images with several shoes** are split; each shoe gets its own vector, all linked to one product.
5. **Query is embedded twice** (original and mirrored) so left/right-facing photos match.
6. **Stage 1 filter + stage 2 search in one SQL call** (`match_embeddings`): category/colour filter, then pgvector HNSW cosine.
7. **Re-rank** top 60 rows: `0.6 global + 0.25 grid + 0.15 colour`. Best score per product.
8. **Soft filters**: if nothing scores above `WIDEN_THRESHOLD`, search again without filters and tell the user.
9. **Bands**: `>= EXISTS_THRESHOLD` exists, `>= POSSIBLE_THRESHOLD` possible, else likely new. The percentage is a display scale of the score, not a probability.

**Tune before trusting it.** Thresholds and weights are starting values. Run `ai-service/evaluate.py` on 30-100 real shop-floor photos, then adjust using the `feedback` table.

## 3. Database
`supabase/migrations/001_init.sql`: `profiles` (role admin/staff), `products`, `product_embeddings` (vector + grid + hist), `match_history`, `feedback`, `sync_jobs`, storage bucket `uploads`, RLS on everything, `match_embeddings()` function.

## 4. Folder structure
```
supabase/migrations/001_init.sql
ai-service/  main.py pipeline.py indexer.py db.py evaluate.py Dockerfile requirements.txt
web/app/     page.tsx (search) history/ admin/ login/ api/ai/[step] api/admin/sync
web/lib/     supabase.ts server.ts useProfile.ts      web/components/Nav.tsx
docker-compose.yml
```

## 5. API
| Route | Who | Purpose |
|---|---|---|
| `POST /api/ai/preprocess` (multipart `file`) | signed in | returns `nobg`, `final` (base64 PNG) |
| `POST /api/ai/embed` (multipart `file`) | signed in | returns `variants` (embeddings) |
| `POST /api/ai/match` `{variants, category, colour}` | signed in | returns `band, top_score, widened, results[]` |
| `POST /api/admin/sync?force=bool` | admin | starts catalogue sync / rebuild |
History, feedback, analytics and user roles use Supabase directly, protected by RLS.

## 6. Setup
**Supabase**: create a project, open SQL Editor, run `001_init.sql`. Auth > Providers: email on. Copy the URL, anon key and service-role key.

**AI service** (Hugging Face Space with Docker SDK, Railway, Render or Fly.io; 2 vCPU / 4 GB RAM minimum, 8 GB is better):
copy `ai-service/.env.example` to `.env` and fill it in (on a host, set the same values as secrets), then `docker build` and run, or push the folder. Port 7860.

**Web (Vercel)**: import the `web` folder, set the variables from `web/.env.example`, deploy.

**First run**: sign up in the app, then in the Supabase SQL editor run
`update profiles set role='admin' where email='you@company.com';`
Open Admin and click **Sync new and changed**. The first index of ~1,500 images takes roughly 20-50 minutes on CPU. Later syncs only process new or changed photos.

**Local**: create `ai-service/.env` and `web/.env.local`, then `docker compose up --build`.

## 7. Scalability
- 1,500 images: pgvector needs no tuning. 100k+: raise `hnsw.ef_search`, add a GPU or more CPU for indexing, run the indexer as a separate worker.
- Sync is incremental (changed `photoUrl` or missing embedding), so re-indexing is cheap.
- The AI service is stateless, so scale it horizontally behind a load balancer.
- Move the sync trigger to a daily cron (Vercel Cron calling `/api/admin/sync` with a service token) when needed.

## 8. Security
Supabase JWT checked server-side on every API call; role from `profiles`; JoggerCo credentials and service key exist only on the AI service/Vercel server env; uploads in a private bucket under per-user folders; AI service rejects calls without `INTERNAL_API_KEY`. **Rotate the JoggerCo password that appeared in the brief.**

## 9. Known limits and next steps
- Not included in v1: live in-browser camera (the phone camera button works), multi-image / 360 / video capture, email-based admin invites.
- The colour field uses your raw codes (BRWN, TAN). A code-to-name map would make the dropdown friendlier.
- Next: use the feedback table to fine-tune weights or train a small re-ranking head; add a text-label OCR check (article code on the box or tag); multi-angle queries (average embeddings across photos); rate limiting on the API routes; automated tests with the evaluation set.
- Not run here: my sandbox has no network, so the code was not executed against your API or the DINOv2 weights. Expect to fix small issues on first run.
