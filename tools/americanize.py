#!/usr/bin/env python3
"""
americanize.py — normalise site copy to American English.

Why: the audience is American. "Résumé", "licence", "cheque", "maths" and
"behaviour" are all correct English and all read as foreign on a US personal
finance site. On a site whose whole product is trust, looking like it was
written somewhere else is a cost with no upside.

SAFETY: replacements are skipped inside URLs, href/src/id/class attribute
values, and <style> blocks — so class names, filenames, CSS keywords and
links are never rewritten. Prose inside JSON-LD and meta tags IS rewritten,
because that text is user-facing.

Usage:
    python tools/americanize.py --check    # report only, writes nothing
    python tools/americanize.py            # apply
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
    # learn-the-lingo/ is the renamed terms/ glossary — it was never in this
    # list, so "normalises" sat live in apr.html through two americanize runs.
    "learn-the-lingo",
]
SKIP_DIR_MARKERS = ("_backup-", "_deploy", "node_modules", ".git")

# British / accented → American. Keys are matched whole-word, case-insensitively;
# the replacement inherits the case pattern of what it replaced.
REPLACEMENTS = {
    # accents — the one Adam flagged
    "résumé": "resume", "resumé": "resume", "résume": "resume", "résumés": "resumes",
    "resumés": "resumes", "résumes": "resumes",
    "café": "cafe", "cafés": "cafes",
    # -our
    "colour": "color", "colours": "colors", "coloured": "colored",
    "favour": "favor", "favours": "favors", "favoured": "favored",
    "favourite": "favorite", "favourites": "favorites",
    "behaviour": "behavior", "behaviours": "behaviors", "behavioural": "behavioral",
    "labour": "labor", "labours": "labors",
    "neighbour": "neighbor", "neighbours": "neighbors",
    "neighbourhood": "neighborhood", "neighbourhoods": "neighborhoods",
    "honour": "honor", "honours": "honors", "honoured": "honored",
    "harbour": "harbor", "rumour": "rumor", "rumours": "rumors",
    "endeavour": "endeavor", "endeavours": "endeavors",
    "favourable": "favorable", "favourably": "favorably",
    "honourable": "honorable", "neighbouring": "neighboring",
    "colourful": "colorful", "flavour": "flavor", "flavours": "flavors",
    "humour": "humor", "rigour": "rigor", "vigour": "vigor",
    "odour": "odors", "savour": "savor", "demeanour": "demeanor",
    # NOT "armour" — the only occurrences on this site are "Under Armour Inc",
    # the company, which is spelled that way and must never be rewritten. Adding
    # it here would silently rename a real ticker on three Markets pages.
    # -ce / -se
    "licence": "license", "licences": "licenses",
    "defence": "defense", "defences": "defenses",
    "offence": "offense", "offences": "offenses",
    "pretence": "pretense",
    "practise": "practice", "practised": "practiced", "practising": "practicing",
    # -ise / -isation
    # added 2026-08-12: the -isation nouns and the cheque compounds that the
    # whole-word matcher had no entries for. "paycheque", "chequebook",
    # "Recharacterisation", "authorisation", "optimisation", "generalisation",
    # "capitalisation", "amortisation" and "visualisation" were all live.
    "paycheque": "paycheck", "paycheques": "paychecks",
    "chequebook": "checkbook", "chequebooks": "checkbooks",
    "authorisation": "authorization", "authorisations": "authorizations",
    "optimisation": "optimization", "optimisations": "optimizations",
    "visualisation": "visualization", "visualisations": "visualizations",
    "generalisation": "generalization", "generalisations": "generalizations",
    "capitalisation": "capitalization", "capitalisations": "capitalizations",
    "amortisation": "amortization",
    "recharacterisation": "recharacterization", "recharacterisations": "recharacterizations",
    "recharacterise": "recharacterize", "recharacterised": "recharacterized",
    "itemisation": "itemization",
    "realise": "realize", "realised": "realized", "realising": "realizing",
    "organise": "organize", "organised": "organized", "organising": "organizing",
    "organisation": "organization", "organisations": "organizations",
    "recognise": "recognize", "recognised": "recognized", "recognising": "recognizing",
    "apologise": "apologize", "apologised": "apologized",
    "utilise": "utilize", "utilised": "utilized",
    "specialise": "specialize", "specialised": "specialized",
    "prioritise": "prioritize", "prioritised": "prioritized",
    "maximise": "maximize", "maximised": "maximized",
    "minimise": "minimize", "minimised": "minimized",
    "analyse": "analyze", "analysed": "analyzed", "analysing": "analyzing",
    "capitalise": "capitalize", "capitalised": "capitalized",
    "penalise": "penalize", "penalised": "penalized",
    "summarise": "summarize", "summarised": "summarized",
    "categorise": "categorize", "categorised": "categorized",
    "amortise": "amortize", "amortised": "amortized",
    "finalise": "finalize", "finalised": "finalized", "finalising": "finalizing",
    "utilisation": "utilization", "civilisation": "civilization",
    "specialisation": "specialization", "globalisation": "globalization",
    "authorise": "authorize", "authorised": "authorized", "authorising": "authorizing",
    "legalise": "legalize", "legalised": "legalized",
    "normalise": "normalize", "normalised": "normalized",
    "stabilise": "stabilize", "stabilised": "stabilized",
    # doubled / single consonants
    "enrolment": "enrollment", "enrolments": "enrollments",
    "enrol": "enroll", "enrols": "enrolls",
    "instalment": "installment", "instalments": "installments",
    "fulfil": "fulfill", "fulfils": "fulfills", "fulfilment": "fulfillment",
    "skilful": "skillful",
    "travelling": "traveling", "travelled": "traveled", "traveller": "traveler",
    "cancelled": "canceled", "cancelling": "canceling",
    "modelling": "modeling", "modelled": "modeled",
    "labelled": "labeled", "labelling": "labeling",
    "fuelled": "fueled", "counsellor": "counselor", "counsellors": "counselors",
    # vocabulary
    "cheque": "check", "cheques": "checks", "chequing": "checking",
    "maths": "math",
    "programme": "program", "programmes": "programs",
    "whilst": "while", "amongst": "among",
    "grey": "gray", "greyer": "grayer",
    "storey": "story", "storeys": "stories",
    "kerb": "curb", "tyre": "tire", "tyres": "tires",
    "aluminium": "aluminum", "catalogue": "catalog", "catalogues": "catalogs",
    "sceptic": "skeptic", "sceptical": "skeptical", "scepticism": "skepticism",
    "cosy": "cozy", "moustache": "mustache",
    "judgement": "judgment", "judgements": "judgments",
    "ageing": "aging", "draught": "draft",
    # ---- added 2026-08-11 (Adam: "we are in america hustlin") ----------
    # Fuel. The site is US-only; "petrol" appeared in three FL Stage 1 places
    # and one Markets line. \b guards mean "Petroleum" (Marathon Petroleum
    # Corp, and the sector regex in market-data) is never touched.
    "petrol": "gas",
    "centre": "center", "centres": "centers", "centred": "centered",
    "centring": "centering",
    "subsidise": "subsidize", "subsidises": "subsidizes",
    "subsidised": "subsidized", "subsidising": "subsidizing",
    "honouring": "honoring",
    "recognisable": "recognizable", "organisational": "organizational",
    "speciality": "specialty", "specialities": "specialties",
    "metre": "meter", "metres": "meters", "litre": "liter", "litres": "liters",
    "tonne": "ton", "tonnes": "tons",
    "lorry": "truck", "lorries": "trucks",
    "postcode": "zip code", "postcodes": "zip codes",
    "jewellery": "jewelry", "plough": "plow", "mould": "mold", "moulds": "molds",
    "gaol": "jail", "aeroplane": "airplane",
    "dialled": "dialed", "dialling": "dialing",
    "orthopaedic": "orthopedic", "paediatric": "pediatric",
    "paediatrician": "pediatrician",
    "learnt": "learned", "spelt": "spelled",
    # Third-person -s forms the original table missed. "normalises" alone was
    # live in three places, including terms/apr.html.
    "realises": "realizes", "organises": "organizes", "recognises": "recognizes",
    "apologises": "apologizes", "utilises": "utilizes",
    "specialises": "specializes", "prioritises": "prioritizes",
    "maximises": "maximizes", "minimises": "minimizes",
    "capitalises": "capitalizes", "penalises": "penalizes",
    "summarises": "summarizes", "categorises": "categorizes",
    "amortises": "amortizes", "finalises": "finalizes",
    "authorises": "authorizes", "legalises": "legalizes",
    "normalises": "normalizes", "stabilises": "stabilizes",
    "practises": "practices",
    # NOT "analyses" — in American English that is the correct plural of
    # "analysis" ("technical analyses"), and this site says it constantly.
    # Rewriting it to "analyzes" would turn 500+ correct nouns into verbs.
}

WORD_RE = re.compile(
    r"\b(" + "|".join(sorted(REPLACEMENTS, key=len, reverse=True)) + r")\b",
    re.IGNORECASE,
)

# Regions we must never rewrite: URLs, link/asset/id/class attribute values,
# and stylesheet blocks.
PROTECTED_RE = re.compile(
    r"https?://[^\s\"'<>)]+"
    r"|(?:href|src|srcset|id|class|for|name=\"viewport\"|data-[\w-]+)\s*=\s*\"[^\"]*\""
    r"|(?:href|src|srcset|id|class)\s*=\s*'[^']*'"
    r"|url\([^)]*\)"
    r"|<style\b[^>]*>.*?</style>",
    re.IGNORECASE | re.DOTALL,
)


def match_case(source: str, target: str) -> str:
    if source.isupper() and len(source) > 1:
        return target.upper()
    if source[0].isupper():
        return target[0].upper() + target[1:]
    return target


def convert(text: str) -> tuple[str, dict]:
    protected = [(m.start(), m.end()) for m in PROTECTED_RE.finditer(text)]
    hits: dict[str, int] = {}

    def in_protected(i: int) -> bool:
        return any(s <= i < e for s, e in protected)

    def sub(m):
        if in_protected(m.start()):
            return m.group(0)
        word = m.group(1)
        new = match_case(word, REPLACEMENTS[word.lower()])
        hits[word] = hits.get(word, 0) + 1
        return new

    return WORD_RE.sub(sub, text), hits


# Generated pages get overwritten by the build, so the copy has to be fixed in the
# source too or the next `deploy-site.ps1` silently puts the British spellings back.
# calc-content.mjs owns all calculator copy; blog-content.mjs owns post metadata.
SOURCE_FILES = [
    "tools/calc-content.mjs",
    "tools/calc-widgets.json",
    "tools/build-calculators.mjs",
    "tools/blog-content.mjs",
    # build-public-stages.mjs carries the FAQ JSON-LD prose that gets injected into
    # the public stage copies — the masters are clean but the build re-added
    # "flat tyre", "favoured" and "loan programmes" on regeneration.
    "tools/build-public-stages.mjs",
    # lingo-content.mjs owns every learn-the-lingo term page. It was missing from
    # this list, so the 2026-08-12 sweep fixed four generated pages and the very
    # next `node tools/build-lingo.mjs` would have put "labelled", "maths",
    # "neighbouring", "sceptical" and "modelled" straight back.
    "tools/lingo-content.mjs",
    "tools/post-shell.template.html",
    "footer.template.html",
    "calculators.js",
    "app.js",
]


def targets():
    seen = set()
    for rel in SOURCE_FILES:
        p = ROOT / rel
        if p.is_file():
            seen.add(p)
            yield p
    for p in sorted(ROOT.glob("*.html")):
        if p in seen:
            continue
        seen.add(p)
        yield p
    for d in TARGET_DIRS:
        base = ROOT / d
        if not base.is_dir():
            continue
        for p in sorted(base.rglob("*.html")):
            if any(m in str(p) for m in SKIP_DIR_MARKERS) or p in seen:
                continue
            seen.add(p)
            yield p


def main() -> int:
    check = "--check" in sys.argv
    total = 0
    touched = 0
    tally: dict[str, int] = {}

    for path in targets():
        try:
            original = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue

        updated, hits = convert(original)
        if not hits:
            continue

        n = sum(hits.values())
        total += n
        touched += 1
        for k, v in hits.items():
            tally[k] = tally.get(k, 0) + v

        if not check:
            path.write_text(updated, encoding="utf-8", newline="\n")

        detail = ", ".join(f"{k}×{v}" for k, v in sorted(hits.items()))
        print(f"  {n:>4}  {path.relative_to(ROOT)}\n        {detail}")

    verb = "would change" if check else "changed"
    print(f"\n{verb} {total} word(s) across {touched} file(s)")
    if tally:
        print("\nBy term:")
        for k, v in sorted(tally.items(), key=lambda x: -x[1]):
            print(f"  {v:>4}  {k} → {match_case(k, REPLACEMENTS[k.lower()])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
