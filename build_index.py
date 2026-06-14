#!/usr/bin/env python3
"""Build data/posts.json index from the posts/*.html archive."""
import os, re, json, html

POSTS_DIR = "posts"
OUT = os.path.join("data", "posts.json")
CATS = os.path.join("data", "categories.json")    # {post_id: slug} from the LLM pass
OVERRIDES = os.path.join("data", "overrides.json") # {post_id: slug} manual corrections (wins)

title_re   = re.compile(r'<h1>(.*?)</h1>', re.S)
date_re    = re.compile(r'<p class="date">(.*?)</p>', re.S)
content_re = re.compile(r'<div class="content">(.*)</div></article>', re.S)
img_re     = re.compile(r'(?:src|href)="\.\./images/([^"]+)"')
pair_re    = re.compile(r'<a[^>]*href="\.\./images/([^"]+)"[^>]*>\s*<img[^>]*src="\.\./images/([^"]+)"', re.S)
tag_re     = re.compile(r'<[^>]+>')
ws_re      = re.compile(r'\s+')

def text_of(frag):
    frag = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', frag, flags=re.S)
    frag = tag_re.sub(' ', frag)
    frag = html.unescape(frag)
    return ws_re.sub(' ', frag).strip()

def load_map(path):
    if os.path.exists(path):
        return {int(k): v for k, v in json.load(open(path, encoding="utf-8")).items()}
    return {}

cats = load_map(CATS)
overrides = load_map(OVERRIDES)

posts = []
for fn in sorted(os.listdir(POSTS_DIR)):
    if not fn.endswith(".html"):
        continue
    raw = open(os.path.join(POSTS_DIR, fn), encoding="utf-8").read()
    m = re.match(r'(\d+)-(.*)\.html$', fn)
    pid = int(m.group(1)) if m else 0

    t = title_re.search(raw)
    title = text_of(t.group(1)) if t else "Untitled"

    d = date_re.search(raw)
    date = text_of(d.group(1)) if d else ""
    year = ""
    ym = re.search(r'/(\d{4})$', date) or re.search(r'(\d{4})', date)
    if ym:
        year = ym.group(1)

    c = content_re.search(raw)
    content = c.group(1) if c else ""

    # An image is stored twice: a thumbnail (img src) linked to a full-size
    # version (anchor href). Collapse each pair to one entry: {f:full, t:thumb}.
    thumb_to_full, full_to_thumb = {}, {}
    for full, thumb in pair_re.findall(raw):
        if thumb != full:
            thumb_to_full[thumb] = full
            full_to_thumb.setdefault(full, thumb)
    seen, images = set(), []
    for im in img_re.findall(raw):
        full = thumb_to_full.get(im, im)        # normalize thumbnail -> full
        if full not in seen:
            seen.add(full)
            images.append({"f": full, "t": full_to_thumb.get(full, full)})

    posts.append({
        "id": pid,
        "slug": fn,
        "title": title,
        "date": date,
        "year": year,
        "cat": overrides.get(pid) or cats.get(pid) or "other",
        "text": text_of(content)[:1200],
        "images": images,
    })

os.makedirs("data", exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(posts, f, ensure_ascii=False, separators=(",", ":"))

total_imgs = sum(len(p["images"]) for p in posts)
print(f"wrote {OUT}: {len(posts)} posts, {total_imgs} image refs, {os.path.getsize(OUT)//1024} KB")
if cats or overrides:
    import collections
    dist = collections.Counter(p["cat"] for p in posts)
    print("categories:", dict(sorted(dist.items(), key=lambda x: -x[1])))
