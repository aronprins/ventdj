# ventdj — agent & contributor guide

A static, client-side archive of the **Maher Ventriloquist Studios / Clinton
Detweiler** blog (≈2,400 posts), deployed on **GitHub Pages**. No build server,
no framework — just static HTML/CSS/JS that fetches a prebuilt JSON index.

## Layout

| Path | What it is |
|------|------------|
| `index.html` | App shell (app bar, screens, tab bar, lightbox). |
| `app.js` | The whole single-page app: routing, list, reader, gallery, lightbox. |
| `app.css` | All styles. |
| `data/posts.json` | Prebuilt search/index data (titles, dates, text, image refs). |
| `posts/NNNN-slug.html` | One static HTML file per archived post. |
| `images/` | Post images (full size + thumbnails). |
| `build_index.py` | Regenerates `data/posts.json` from `posts/*.html` (+ folds in categories). |
| `data/categories.json` | `{post_id: slug}` — LLM-assigned category per post. |
| `data/overrides.json` | `{post_id: slug}` — optional manual category corrections (win over the above). |
| `build.sh` | Stamps the cache-busting version (see below). |
| `.githooks/pre-commit` | Runs `build.sh` and re-stages the stamped files. |

## Cache-busting / versioning (automated)

Mobile browsers aggressively cache `app.js`, `app.css`, and the JSON, so every
deploy appends `?v=<version>` to those URLs. The version is **derived from asset
content** and stamped automatically — you never hand-edit it.

- `build.sh` hashes the content of `index.html`, `app.js`, `app.css`, and
  `data/posts.json` (with existing version tokens normalized out), takes the
  first 8 chars, and writes it into:
  - `app.js` → `var VERSION="…"` (used for the `posts.json` and per-post fetches), and
  - `index.html` → the `?v=…` on `app.css` and `app.js`.
- Because the version is content-derived, it only changes when assets actually
  change, and re-running `build.sh` is a no-op (so committing never loops).

**Enable the hook once per clone:**

```bash
git config core.hooksPath .githooks
```

After that, a normal `git commit` re-stamps and re-stages `app.js` + `index.html`
automatically. (The hook always re-stages those two files, so don't keep
unrelated unstaged edits in them at commit time.) You can also stamp manually
with `./build.sh`.

> Note: `index.html` itself can't carry a `?v=`; it's the entry point. GitHub
> Pages serves it with an ETag + short TTL so it revalidates quickly, and the
> `?v=` mechanism keeps the linked assets fresh from there.

## Common tasks

**Add / change posts** → edit or add files under `posts/`, then rebuild the index
and let the version restamp on commit:

```bash
python3 build_index.py     # regenerates data/posts.json
git add -A && git commit   # pre-commit hook restamps the version
```

**Preview locally** (the app fetches JSON over HTTP, so `file://` won't work):

```bash
python3 -m http.server
# open http://localhost:8000
```

## Categories

Each post has a `cat` slug, surfaced as the chip filter under the app bar (and
applied to the gallery too). The eight buckets:

`figures` (Figures), `forsale` (For Sale), `making` (Making), `lessons`
(Lessons), `qa` (Q&A), `people` (People), `events` (Events), `other` (Other).

Assignment: an LLM pass labeled every post into `data/categories.json`;
`build_index.py` writes the result into each post's `cat`. To correct a post,
add `"<id>": "<slug>"` to `data/overrides.json` (it wins over the LLM label) and
rerun `python3 build_index.py`. Images inherit their post's category.

The chip labels live in the `CATS` array in `app.js` — keep the slugs in sync
with `categories.json`.

## Conventions

- Plain ES5-style JS in one IIFE in `app.js`, no bundler, no dependencies
  (Font Awesome is the only external asset). Keep it that way unless asked.
- Routing is hash-based (`#/`, `#/gallery`, `#/post/<id>`, `#/photo/<file>`,
  `#/post/<id>/photo/<file>`) for GitHub Pages deep-linking. Preserve these.
- The lightbox supports pinch-zoom / double-tap / drag-pan / wheel-zoom; swipe
  navigation and swipe-down-to-close apply only when not zoomed in.
