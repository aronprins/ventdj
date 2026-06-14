#!/usr/bin/env python3
"""Build data/posts.json index from the posts/*.html archive."""
import os, re, json, html

POSTS_DIR = "posts"
OUT = os.path.join("data", "posts.json")

title_re   = re.compile(r'<h1>(.*?)</h1>', re.S)
date_re    = re.compile(r'<p class="date">(.*?)</p>', re.S)
content_re = re.compile(r'<div class="content">(.*)</div></article>', re.S)
img_re     = re.compile(r'(?:src|href)="\.\./images/([^"]+)"')
tag_re     = re.compile(r'<[^>]+>')
ws_re      = re.compile(r'\s+')

def text_of(frag):
    frag = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', frag, flags=re.S)
    frag = tag_re.sub(' ', frag)
    frag = html.unescape(frag)
    return ws_re.sub(' ', frag).strip()

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

    # unique images in document order
    seen, images = set(), []
    for im in img_re.findall(raw):
        if im not in seen:
            seen.add(im); images.append(im)

    posts.append({
        "id": pid,
        "slug": fn,
        "title": title,
        "date": date,
        "year": year,
        "text": text_of(content)[:1200],
        "images": images,
    })

os.makedirs("data", exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(posts, f, ensure_ascii=False, separators=(",", ":"))

total_imgs = sum(len(p["images"]) for p in posts)
print(f"wrote {OUT}: {len(posts)} posts, {total_imgs} image refs, {os.path.getsize(OUT)//1024} KB")
