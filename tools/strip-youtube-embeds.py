#!/usr/bin/env python3
"""
strip-youtube-embeds.py — replace every YouTube <iframe> embed on the site with
a branded text link.

Why: embeds load ~1MB of Google JS per video, drag Core Web Vitals down, set
third-party cookies (a consent-banner liability), and give YouTube a tracking
hook on every course page. A link costs nothing and keeps the reader on our page
until they choose to leave.

Scope: course masters + the generated public copies + standalone course folders.
Never touches _backup-* or _deploy (build output — deploy-site.ps1 regenerates).

Usage:
    python tools/strip-youtube-embeds.py --check    # report only, writes nothing
    python tools/strip-youtube-embeds.py            # apply
"""

import re
import sys
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

TARGET_DIRS = [
    "Financial Literacy Course",
    "TA Course",
    "Fundemental Course",
    "EconomicsCourse",
    "TradingPsycologycourse",
    "Markets",
    "blog",
]
TARGET_ROOT_GLOBS = ["*.html"]
SKIP_DIR_MARKERS = ("_backup-", "_deploy", "node_modules", ".git")

# The 16:9 ratio wrapper div that contains nothing but a YouTube iframe.
WRAPPED = re.compile(
    r'[ \t]*<div[^>]*padding-bottom:\s*56\.25%[^>]*>\s*'
    r'<iframe\b[^>]*\bsrc="https://www\.youtube(?:-nocookie)?\.com/embed/'
    r'(?P<id>[A-Za-z0-9_-]{6,})(?P<query>\?[^"]*)?"[^>]*>\s*</iframe>\s*'
    r'</div>[ \t]*\n?',
    re.IGNORECASE,
)

# Any remaining bare YouTube iframe not inside a ratio wrapper.
BARE = re.compile(
    r'[ \t]*<iframe\b[^>]*\bsrc="https://www\.youtube(?:-nocookie)?\.com/embed/'
    r'(?P<id>[A-Za-z0-9_-]{6,})(?P<query>\?[^"]*)?"[^>]*>\s*</iframe>[ \t]*\n?',
    re.IGNORECASE,
)

# Any leftover embed URL we did not convert — must be zero when we are done.
RESIDUAL = re.compile(r'youtube(?:-nocookie)?\.com/embed', re.IGNORECASE)


def watch_url(video_id: str, query: str | None) -> str:
    """Turn an /embed/ID?start=90 URL into a /watch?v=ID&t=90s URL."""
    url = f"https://www.youtube.com/watch?v={video_id}"
    if query:
        params = dict(
            p.split("=", 1) for p in query.lstrip("?").split("&") if "=" in p
        )
        start = params.get("start") or params.get("t")
        if start and start.rstrip("s").isdigit():
            url += f"&t={start.rstrip('s')}s"
    return url


def link_html(video_id: str, query: str | None, indent: str = "          ") -> str:
    url = watch_url(video_id, query)
    return (
        f'{indent}<a class="vid-link" href="{url}" '
        f'target="_blank" rel="noopener noreferrer">'
        f'<span class="vid-link-play" aria-hidden="true">&#9654;</span>'
        f'Watch on YouTube'
        f'<span class="vid-link-note">opens in a new tab</span></a>\n'
    )


def convert(text: str) -> tuple[str, int]:
    count = 0

    def sub(m):
        nonlocal count
        count += 1
        return link_html(m.group("id"), m.group("query"))

    text = WRAPPED.sub(sub, text)
    text = BARE.sub(sub, text)
    return text, count


def targets():
    seen = set()
    for g in TARGET_ROOT_GLOBS:
        for p in sorted(ROOT.glob(g)):
            if p not in seen:
                seen.add(p)
                yield p
    for d in TARGET_DIRS:
        base = ROOT / d
        if not base.is_dir():
            continue
        for p in sorted(base.rglob("*.html")):
            if any(m in str(p) for m in SKIP_DIR_MARKERS):
                continue
            if p not in seen:
                seen.add(p)
                yield p


def main() -> int:
    check = "--check" in sys.argv
    total = 0
    touched = 0
    residual_files = []

    for path in targets():
        try:
            original = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError) as e:
            print(f"  SKIP  {path.relative_to(ROOT)}  ({e})")
            continue

        if "youtube" not in original.lower():
            continue

        updated, n = convert(original)
        if n == 0:
            continue

        total += n
        touched += 1
        rel = path.relative_to(ROOT)

        if RESIDUAL.search(updated):
            residual_files.append(rel)

        if check:
            print(f"  would convert {n:>3}  {rel}")
        else:
            path.write_text(updated, encoding="utf-8", newline="\n")
            print(f"  converted     {n:>3}  {rel}")

    verb = "would convert" if check else "converted"
    print(f"\n{verb} {total} embed(s) across {touched} file(s)")

    if residual_files:
        print("\nWARNING — embed URLs still present in:")
        for r in residual_files:
            print(f"  {r}")
        return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
