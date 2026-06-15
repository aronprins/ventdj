# ventdj — Offline Archive Reader

## About this archive

This is a preserved copy of **ventdj.blogspot.com** — *"Mr. D's Daily
Ventriloquist Journal"*, the blog of **Clinton Detweiler** (1936–2013), the man
who for decades ran **Maher Studios** and, through it, helped teach the world
to "throw its voice."

### Who was Clinton Detweiler?

Clinton Detweiler began as a schoolteacher in the late 1950s who hit on an
unconventional idea: using a ventriloquist figure in the classroom to reach his
students. That spark turned into a life's work. On **August 1, 1969**, Clinton
and his wife **Adelia Detweiler** purchased **Maher Studios** from Madeline
Maher — widow of founder **Fred Maher**, who had started the school decades
earlier and copyrighted his famous 30-lesson home-study course back in 1948.

Under the Detweilers, Maher Studios grew into the leading ventriloquism supply
house in North America — a one-stop hub for anyone learning the craft. Its
cornerstone was the **Maher Course of Ventriloquism**, the correspondence course
(the "Detweiler version") that taught thousands of students around the globe,
many of whom went on to perform professionally. Alongside the course, Maher sold
how-to books and DVDs, props, carrying cases, and ventriloquist figures, and
Clinton served as a past **President of the North American Association of
Ventriloquists (NAAV)**.

### The dummies he built

Clinton wasn't only a teacher and shopkeeper — he was a **figure maker and
restorer**. Working out of his shop in Littleton, Colorado, he hand-carved
figures from basswood, built knee-pal and hard-figure characters, and breathed
new life into old and damaged dummies — repairing, repainting, and upgrading
them with moving eyes and eyebrows and other mechanisms. He restored vintage
figures (including classic **Jerry Mahoney** dummies), produced his own
"Clinton Detweiler" figures and heads, and created collector memorabilia such as
signed Collector Cards and the well-loved **Vent Coins**. Figures that passed
through his hands are owned and treasured by ventriloquists to this day.

Maher Studios wound down around 2006, but Clinton stayed busy — building and
fixing figures, answering questions from vents worldwide, and writing this
daily blog — right up until his sudden passing on **January 22, 2013**. The
business was later revived as the **New Maher Studios** so the legacy he and the
Mahers built could carry on.

### What's in here

This blog is a treasure trove of that world: notes on figures and dummies,
repair and building tips, course and product news, questions-and-answers with
readers, marketplace listings, ventriloquist history, photographs, and Clinton's
own day-to-day reflections. The archive spans **2,405 posts from 2009 to 2014**
and around **2,700 images**, captured so the content can still be read and
browsed even if the original blog ever goes offline.

Rather than a folder full of raw HTML, it's wrapped in a small reading app so you
can search the whole archive, filter by year, page through posts, and flip
through every image in a gallery. Everything — posts and pictures — is stored
locally in this repository; nothing depends on the original blog still being
online.

## The reader app

A self-contained, app-style reader for the archive. Pure HTML/CSS/JS, no build
step, no backend.

## Features

- **Reader** — browse all posts in a mobile-app-style list; tap to read, with
  Prev/Next navigation.
- **Search & filter** — full-text search across titles and post text, filter by
  year, and sort by oldest / newest / title.
- **Gallery** — every image in a tap-to-zoom grid with infinite scroll and a
  full-screen lightbox (keyboard arrows + swipe gestures on touch).
- **Mobile-first** — full-screen on phones, centered phone-style frame on
  desktop, light theme, Font Awesome icons.
- **Deep links** — hash-based routing (`#/post/<id>`, `#/gallery`, …) so any
  view can be bookmarked or shared and survives a reload.

## Running locally

The app loads its data with `fetch()`, which browsers block over `file://`, so
serve the folder over HTTP:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Project structure

```
index.html        # the reader app shell
app.css           # styles (light, mobile-first)
app.js            # search / filter / reader / gallery / lightbox + routing
data/posts.json   # generated index: title, date, year, text, images per post
build_index.py    # regenerates data/posts.json from posts/*.html
posts/            # 2,405 archived post pages
images/           # archived images (thumbnail + full-size per picture)
all-posts.html    # plain static index of every post (fallback, no JS)
```

## Rebuilding the index

`data/posts.json` is generated from the post HTML. After changing posts, run:

```bash
python3 build_index.py
```

## Routing

| Hash | View |
| --- | --- |
| `#/` | Discover (home) |
| `#/journal` | full archive post list |
| `#/faq`, `#/how-to`, `#/people`, `#/authors` | the derived readers (each with its own categories) |
| `#/<mode>/<category>` | a derived reader pre-filtered (e.g. `#/how-to/basswood`) |
| `#/gallery` | image gallery |
| `#/post/<id>` | a single post |
| `#/photo/<file>` | lightbox (from gallery) |
| `#/post/<id>/photo/<file>` | lightbox (in-post image) |

## Notes

- Font Awesome is loaded from a CDN, so icons need an internet connection; the
  posts and images themselves are fully offline.
- This is a personal archival/reading project. All blog content and images
  belong to their original author at ventdj.blogspot.com.

## Sources

Biographical details about Clinton Detweiler and Maher Studios were drawn from
the archived blog itself and the following:

- [Rest in Peace Clinton Detweiler (1936–2013) — PuppetVision Blog](http://puppetvision.blog/2013/01/rest-in-peace-clinton-detweiler-1936-2013/)
- [Our Story — Maher Studios](https://maherstudios.com/our-story/)
- [Past, Present & Future — Maher Studios](https://maherstudios.com/past-present-future/)
- [Clinton Detweiler: Building Dummies In The Heavens — Ventriloquist Central Blog](https://ventriloquistcentralblog.com/clinton-detweiler-building-dummies-in-the-heavens/)
- [Mr. D's Daily Ventriloquist Journal — ventdj.blogspot.com](http://ventdj.blogspot.com/)
