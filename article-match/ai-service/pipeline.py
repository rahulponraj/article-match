"""Footwear image pipeline: background removal -> shoe extraction -> DINOv2 features."""
import io, base64
import numpy as np, cv2, torch
from PIL import Image, ImageOps

_state = {}
MODEL = "facebook/dinov2-base"
SIZE = 224  # 16x16 patches of 14px

def load():
    if _state: return
    from rembg import new_session
    from transformers import AutoImageProcessor, AutoModel
    _state["seg"] = new_session("isnet-general-use")
    _state["proc"] = AutoImageProcessor.from_pretrained(MODEL)
    _state["model"] = AutoModel.from_pretrained(MODEL).eval()

def remove_bg(img: Image.Image) -> Image.Image:
    from rembg import remove
    load()
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((1024, 1024))
    return remove(img, session=_state["seg"])  # RGBA

def extract_shoes(rgba: Image.Image, multi=False):
    """Crop shoe(s) onto a white square. multi=True splits catalogue images that hold several shoes."""
    a = np.array(rgba)
    mask = (a[:, :, 3] > 128).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask)
    comps = sorted(range(1, n), key=lambda i: -stats[i, cv2.CC_STAT_AREA])
    if not comps:  # segmentation failed: fall back to the whole image
        return [_square(Image.fromarray(a[:, :, :3]))]
    big = stats[comps[0], cv2.CC_STAT_AREA]
    if multi:
        groups = [[i] for i in comps if stats[i, cv2.CC_STAT_AREA] >= 0.25 * big][:3]
    else:  # a tag or strap can split the shoe: merge every meaningful piece
        groups = [[i for i in comps if stats[i, cv2.CC_STAT_AREA] >= 0.04 * big]]
    out = []
    for g in groups:
        m = np.isin(labels, g)
        m = cv2.dilate(m.astype(np.uint8), np.ones((3, 3), np.uint8)).astype(bool)
        ys, xs = np.where(m)
        canvas = np.full(a.shape[:2] + (3,), 255, np.uint8)
        canvas[m] = a[:, :, :3][m]
        out.append(_square(Image.fromarray(canvas[ys.min():ys.max() + 1, xs.min():xs.max() + 1])))
    return out

def _square(im: Image.Image) -> Image.Image:
    w, h = im.size; s = int(max(w, h) * 1.12)
    bg = Image.new("RGB", (s, s), (255, 255, 255))
    bg.paste(im, ((s - w) // 2, (s - h) // 2))
    return bg.resize((SIZE, SIZE), Image.LANCZOS)

def _norm(v):
    v = np.asarray(v, dtype=np.float32); return v / (np.linalg.norm(v) + 1e-8)

def _hist(im: Image.Image):
    arr = np.array(im)
    hsv = cv2.cvtColor(arr, cv2.COLOR_RGB2HSV)
    fg = (~(arr > 245).all(axis=2)).astype(np.uint8)  # ignore white background
    if fg.sum() < 50: fg[:] = 1
    h = cv2.calcHist([hsv], [0, 1, 2], fg, [8, 4, 4], [0, 180, 0, 256, 0, 256]).flatten()
    return (h / (h.sum() + 1e-8)).astype(np.float32)

@torch.no_grad()
def embed(images):
    load()
    inp = _state["proc"](images=images, return_tensors="pt", do_resize=False, do_center_crop=False)
    tok = _state["model"](**inp).last_hidden_state
    out = []
    for i, im in enumerate(images):
        cls, p = tok[i, 0].numpy(), tok[i, 1:].numpy()            # p: 256 x 768
        g = _norm(np.concatenate([_norm(cls), _norm(p.mean(0))]))   # 1536 dims
        grid = p.reshape(16, 16, -1)
        cells = [_norm(grid[r:r + 8, c:c + 8].mean((0, 1))) for r in (0, 8) for c in (0, 8)]
        out.append({"g": g.tolist(), "grid": _norm(np.concatenate(cells)).tolist(), "hist": _hist(im).tolist()})
    return out

def to_b64(im: Image.Image) -> str:
    b = io.BytesIO(); im.save(b, "PNG"); return base64.b64encode(b.getvalue()).decode()
