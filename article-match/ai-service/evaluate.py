"""Measure accuracy on real data. Put query photos in a folder, named ARTICLE_COLOUR__anything.jpg
(e.g. 10100_TAN__floor1.jpg), then run:  python evaluate.py ./test_photos"""
import sys, glob, os
from PIL import Image, ImageOps
import pipeline
from main import _retrieve
from db import sb

ids = {f"{r['article']}_{r['colour']}": r["id"] for r in sb.table("products").select("id,article,colour").limit(100000).execute().data}
top1 = top5 = n = 0
for f in sorted(glob.glob(os.path.join(sys.argv[1], "*"))):
    key = os.path.basename(f).split("__")[0]
    if key not in ids: continue
    final = pipeline.extract_shoes(pipeline.remove_bg(Image.open(f)))[0]
    vs = pipeline.embed([final, ImageOps.mirror(final)])
    ranked = [i for i, _ in sorted(_retrieve(vs, None, None).items(), key=lambda kv: -kv[1])]
    n += 1; top1 += ranked[:1] == [ids[key]]; top5 += ids[key] in ranked[:5]
    print(f"{key}: rank {ranked.index(ids[key]) + 1 if ids[key] in ranked else '>60'}")
print(f"\n{n} queries  top-1 {top1 / max(n, 1):.0%}  top-5 {top5 / max(n, 1):.0%}")
