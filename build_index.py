#!/usr/bin/env python3
"""Build data/posts.json (+ data/topics.json) from the posts/*.html archive.

Everything here is *derived* metadata — the post HTML in posts/ is never
modified. We add, per post: a FAQ flag + extracted question (the recurring
"… From Mr. D:" answer format), and up to three related-post ids (TF-IDF
cosine). We also emit data/topics.json: a materials/technique index and a
people-&-figures index, each mapping a term to the posts that mention it.
"""
import os, re, json, html, math, collections

POSTS_DIR = "posts"
OUT = os.path.join("data", "posts.json")
TOPICS_OUT = os.path.join("data", "topics.json")
CATS = os.path.join("data", "categories.json")    # {post_id: slug} from the LLM pass
OVERRIDES = os.path.join("data", "overrides.json") # {post_id: slug} manual corrections (wins)

title_re   = re.compile(r'<h1>(.*?)</h1>', re.S)
date_re    = re.compile(r'<p class="date">(.*?)</p>', re.S)
content_re = re.compile(r'<div class="content">(.*)</div></article>', re.S)
img_re     = re.compile(r'(?:src|href)="\.\./images/([^"]+)"')
pair_re    = re.compile(r'<a[^>]*href="\.\./images/([^"]+)"[^>]*>\s*<img[^>]*src="\.\./images/([^"]+)"', re.S)
tag_re     = re.compile(r'<[^>]+>')
ws_re      = re.compile(r'\s+')

# The recurring Q&A format: a reader question, a separator, then the answer
# introduced by "From Mr. D:" (spelling/spacing varies a little).
MRD_RE   = re.compile(r'from\s+mr\.?\s*d\b\s*:?', re.I)
QLABEL_RE = re.compile(r'^\s*(?:question|from[^:]{0,40})\s*:\s*', re.I)
SEP_RE    = re.compile(r'(?:\*\s*){3,}')   # "* * * * *" question/answer divider

def text_of(frag):
    frag = re.sub(r'<(script|style)[^>]*>.*?</\1>', ' ', frag, flags=re.S)
    frag = tag_re.sub(' ', frag)
    frag = html.unescape(frag)
    return ws_re.sub(' ', frag).strip()

def load_map(path):
    if os.path.exists(path):
        return {int(k): v for k, v in json.load(open(path, encoding="utf-8")).items()}
    return {}

def extract_question(ftext, title):
    """For a Q&A post, return (question, is_question). The question is the text
    before Mr. D's answer, trimmed of its echoed title and 'Question:'/'From X:'
    label. is_question is True only when it reads as an actual reader question
    (so testimonials/coin bios sharing the format don't land in FAQ)."""
    m = MRD_RE.search(ftext)
    if not m:
        return "", False
    q = ftext[:m.start()]
    q = SEP_RE.split(q)[0]             # keep the half before the "* * *" divider
    if title and q[:len(title)].lower() == title.lower():
        q = q[len(title):]            # drop the echoed post title
    is_q = ("?" in q) or bool(re.search(r"\bquestion", q, re.I))
    q = QLABEL_RE.sub("", q).strip(" -:*•·–— ")
    return ws_re.sub(" ", q).strip(), is_q

# Guest columns — the journal regularly runs "X Writes" / "Written by X" pieces
# by other contributors (Mark Wade, Bob Abdou, Ken Groves, …). Flag them so the
# "On this day" highlight can show only Mr. D's own writing; the rest of the app
# still surfaces them normally.
GUEST_NAME   = r"[A-Z][\w.'-]+(?: [A-Z][\w.'-]+){0,2}"
GUEST_WRITES = re.compile(r"^(%s)\s+Writes\b" % GUEST_NAME)
GUEST_LEAD   = re.compile(r"^(?:Written by|By)\s+([A-Z][\w.'-]+ [A-Z][\w.'-]+(?: [A-Z][\w.'-]+)?)\b")
GUEST_SELF   = re.compile(r"^(clinton detweiler|clinton|mr\.?\s*d)\b", re.I)  # Mr. D is not a guest
def is_guest(title, ftext):
    m = GUEST_WRITES.match(title.strip())
    if m and not GUEST_SELF.match(m.group(1)): return True
    m = GUEST_LEAD.match(ftext[:90].strip())
    if m and not GUEST_SELF.match(m.group(1)): return True
    return False

# ---- topic vocabularies (curated). Each entry: (slug, label, group, pattern).
# Matching is case-insensitive over each post's full text; a post counts once.
MATERIALS = [
    ("basswood",    "Basswood",        r"basswood"),
    ("papermache",  "Papier-mâché",    r"paper[\s-]?mache|papier"),
    ("wooddough",   "Wood dough",      r"wood dough"),
    ("eyebrows",    "Eyebrows",        r"eyebrow"),
    ("eyes",        "Eyes & eye mechs",r"glass eye|moving eye|eye mech"),
    ("wigs",        "Wigs & hair",     r"\bwig\b|\bwigs\b|mohair"),
    ("headstick",   "Headsticks & controls", r"head ?stick|control stick"),
    ("latex",       "Latex",           r"\blatex\b"),
    ("rubberband",  "Rubber bands",    r"rubber ?band"),
    ("leather",     "Leather",         r"\bleather\b"),
    ("acrylic",     "Acrylic paint",   r"\bacrylic"),
    ("artfoam",     "Art foam",        r"art foam"),
    ("dremel",      "Dremel",          r"\bdremel\b"),
    ("plaster",     "Plaster",         r"\bplaster\b"),
    ("fiberglass",  "Fiberglass",      r"fiber ?glass"),
]
PEOPLE = [
    # famous ventriloquists
    ("edgar-bergen",  "Edgar Bergen",   "vent",   r"edgar bergen|\bbergen\b"),
    ("paul-winchell", "Paul Winchell",  "vent",   r"winchell"),
    ("jimmy-nelson",  "Jimmy Nelson",   "vent",   r"jimmy nelson"),
    ("jeff-dunham",   "Jeff Dunham",    "vent",   r"dunham"),
    ("terry-fator",   "Terry Fator",    "vent",   r"fator"),
    ("jay-johnson",   "Jay Johnson",    "vent",   r"jay johnson"),
    ("shari-lewis",   "Shari Lewis",    "vent",   r"shari lewis"),
    ("senor-wences",  "Señor Wences",   "vent",   r"se[nñ]or wences|wences"),
    ("willie-tyler",  "Willie Tyler",   "vent",   r"willie tyler"),
    ("ronn-lucas",    "Ronn Lucas",     "vent",   r"ronn lucas"),
    ("ws-berger",     "W. S. Berger",   "vent",   r"w\.?\s*s\.?\s*berger|\bberger\b"),
    # classic figures / characters
    ("charlie",       "Charlie McCarthy","figure", r"charlie mccarthy|mccarthy"),
    ("mortimer",      "Mortimer Snerd",  "figure", r"mortimer snerd|snerd"),
    ("jerry-mahoney", "Jerry Mahoney",   "figure", r"jerry mahoney|mahoney"),
    ("knucklehead",   "Knucklehead Smiff","figure",r"knucklehead"),
    ("danny-oday",    "Danny O'Day",     "figure", r"danny o'?day"),
    ("farfel",        "Farfel",          "figure", r"farfel"),
    ("lester",        "Lester",          "figure", r"\blester\b"),
    ("lamb-chop",     "Lamb Chop",       "figure", r"lamb ?chop"),
    ("howdy-doody",   "Howdy Doody",     "figure", r"howdy doody"),
    # the people behind Maher Studios
    ("fred-maher",    "Fred Maher",      "maher",  r"fred maher"),
    ("madeline-maher","Madeline Maher",  "maher",  r"madeline maher"),
    ("adelia",        "Adelia Detweiler","maher",  r"\badelia\b"),
    ("mark-wade",     "Mark Wade",       "maher",  r"mark wade"),
    ("tom-crowl",     "Tom Crowl",       "maher",  r"tom crowl"),
    ("ken-groves",    "Ken Groves",      "maher",  r"ken groves"),
]
TOPIC_MIN = 5   # drop terms mentioned in fewer than this many posts

# FAQ-specific buckets. The global `cat` is useless for FAQ (almost every Q&A
# is "qa"), so each FAQ gets its own `fcat` by scoring keyword hits over the
# question + title. Keep these slugs/labels in sync with FAQCATS in app.js.
FAQ_CATS = [
    ("building",   "Building",       r"\b(make|makes|making|build|building|carve|carving|scratch|teeth|basswood|wood ?dough|papier|mache|art foam|foam|mold|molds|sculpt|sculpting|create)\b"),
    ("repair",     "Repair & care",  r"\b(repair|repairs|restore|restoration|restoring|fix|fixing|broken|crack|cracked|replace|replacement|rubber ?band|repaint|touch.?up|peeling|chipped|loose|refurbish|clean|cleaning|humidity|aging)\b"),
    ("mechanics",  "Eyes & mechanics", r"\b(moving eyes?|eye mech\w*|self.?center\w*|eyebrows?|winker|winkers|wiggl\w*|mouth ?stick|head ?stick|mechanism|mechanics|slot ?head|automatic eyes?|control stick|spring|springs)\b"),
    ("voice",      "Voice & technique", r"\b(voice|lips?|labial|throat|breath\w*|distant voice|near voice|practice|practise|vent position|technique|tongue|projection|sound\w*|resonan\w*)\b"),
    ("performing", "Performing",     r"\b(audience|show|shows|perform\w*|stage|gig|gigs|routine|routines|script|scripts|gag|gags|character|booking|fee|fees|nervous|walk.?around|banquet|comedy|dialogue|venue)\b"),
    ("identify",   "ID & value",     r"\b(who made|identif\w*|builder|who built|value|worth|appraise|appraisal|collector|collectible|insull|lovik|juro|garage sale|antique|ebay|how old|maker|original|vintage)\b"),
    ("products",   "Course & store", r"\b(course|lessons?|book|books|dvd|catalog\w*|coin|coins|sticker|stickers|case|cases|product|order|orders|price|cost|charge|buy|buying|purchase|sell|selling|closeout|kindle|shipping)\b"),
]
FAQ_CATS_C = [(slug, re.compile(rx, re.I)) for slug, _, rx in FAQ_CATS]
def classify_faq(text):
    best, bestn = "other", 0
    for slug, rx in FAQ_CATS_C:
        n = len(rx.findall(text))
        if n > bestn:
            bestn, best = n, slug
    return best

STOP = set("""the and for you your with that this have are was not but his her she him our out who all any can
had has from they them their what when where which while will would there here been being into over more most
some such than then thee thy our ours about above after again against because before below between both down
during each few further once only other same too very just don now get got let put say see use used using one
two three new old day days time mr made make making well way back like really much also able even still going
get http https www com blogspot html jpg png image images post posts""".split())

# ---------- load posts ----------
cats = load_map(CATS)
overrides = load_map(OVERRIDES)

posts = []
ftexts = []   # full (untruncated) text per post, parallel to `posts`
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
    ftext = text_of(content)

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

    rec = {
        "id": pid,
        "slug": fn,
        "title": title,
        "date": date,
        "year": year,
        "cat": overrides.get(pid) or cats.get(pid) or "other",
        "text": ftext[:1200],
        "images": images,
    }
    q, is_q = extract_question(ftext, title)
    if is_q:
        rec["faq"] = 1
        rec["fcat"] = classify_faq(title + " " + q)
        if q:
            rec["q"] = q[:240]
    if is_guest(title, ftext):
        rec["guest"] = 1
    posts.append(rec)
    ftexts.append(ftext)

# ---------- topics index (materials + people/figures) ----------
def build_index(vocab, has_group):
    out = []
    for entry in vocab:
        if has_group:
            slug, label, group, pat = entry
        else:
            slug, label, pat = entry; group = ""
        rx = re.compile(pat, re.I)
        ids = [posts[i]["id"] for i in range(len(posts)) if rx.search(ftexts[i])]
        if len(ids) >= TOPIC_MIN:
            item = {"slug": slug, "label": label, "n": len(ids), "ids": ids}
            if has_group:
                item["group"] = group
            out.append(item)
    out.sort(key=lambda x: -x["n"])
    return out

topics = {
    "materials": build_index(MATERIALS, False),
    "people":    build_index(PEOPLE, True),
}

# ---------- related posts (TF-IDF cosine, top 3) ----------
def tokenize(s):
    return [w for w in re.findall(r"[a-z][a-z']{2,}", s.lower()) if w not in STOP]

N = len(posts)
tfs = [collections.Counter(tokenize(ft)) for ft in ftexts]
df = collections.Counter()
for tf in tfs:
    df.update(tf.keys())

# keep discriminative terms: seen in >=2 posts, not in more than half, and
# (for candidate generation) not absurdly common.
idf = {t: math.log(N / d) for t, d in df.items() if 2 <= d <= N * 0.5}

vecs = []          # per doc: list of (term, weight), L2-normalized, top terms only
for tf in tfs:
    v = {t: (1 + math.log(c)) * idf[t] for t, c in tf.items() if t in idf}
    norm = math.sqrt(sum(w * w for w in v.values())) or 1.0
    top = sorted(v.items(), key=lambda kv: -kv[1])[:25]
    vecs.append([(t, w / norm) for t, w in top])

# inverted index over moderately-rare terms only (bounds the work)
inv = collections.defaultdict(list)
for i, v in enumerate(vecs):
    for t, w in v:
        if df[t] <= 200:
            inv[t].append((i, w))

for i, v in enumerate(vecs):
    scores = collections.defaultdict(float)
    for t, w in v:
        if df[t] <= 200:
            for j, wj in inv[t]:
                if j != i:
                    scores[j] += w * wj
    best = sorted(scores.items(), key=lambda kv: -kv[1])[:3]
    rel = [posts[j]["id"] for j, s in best if s > 0.06]
    if rel:
        posts[i]["rel"] = rel

# ---------- write ----------
os.makedirs("data", exist_ok=True)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(posts, f, ensure_ascii=False, separators=(",", ":"))
with open(TOPICS_OUT, "w", encoding="utf-8") as f:
    json.dump(topics, f, ensure_ascii=False, separators=(",", ":"))

total_imgs = sum(len(p["images"]) for p in posts)
faq_n = sum(1 for p in posts if p.get("faq"))
rel_n = sum(1 for p in posts if p.get("rel"))
print(f"wrote {OUT}: {len(posts)} posts, {total_imgs} image refs, {os.path.getsize(OUT)//1024} KB")
print(f"  FAQ posts: {faq_n}  ·  posts with related links: {rel_n}")
fdist = collections.Counter(p.get("fcat") for p in posts if p.get("faq"))
print("  FAQ categories:", dict(sorted(fdist.items(), key=lambda x: -x[1])))
print("  guest-column posts (excluded from On this day):", sum(1 for p in posts if p.get("guest")))
print(f"wrote {TOPICS_OUT}: {len(topics['materials'])} materials, {len(topics['people'])} people/figures")
for k in ("materials", "people"):
    print(f"  {k}: " + ", ".join(f"{t['label']}({t['n']})" for t in topics[k]))
if cats or overrides:
    dist = collections.Counter(p["cat"] for p in posts)
    print("categories:", dict(sorted(dist.items(), key=lambda x: -x[1])))
