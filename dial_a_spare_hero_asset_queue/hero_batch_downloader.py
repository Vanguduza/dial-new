#!/usr/bin/env python3
"""
Dial a Spare — licensed hero-image batch acquisition queue.

Purpose
-------
Search openly licensed image indexes for candidate vehicle "hero" photographs,
download only conservative commercial+derivative-compatible candidates, and
write a provenance/review queue for transition-pack development.

This script DOES NOT:
- scrape 7zap or copy 7zap images;
- treat a search result as automatically approved;
- decide parts fitment;
- promote an image into production without human review.

Sources
-------
1. Wikimedia Commons Action API (first)
2. Openverse API (fallback or additional source)

Python
------
3.10+; standard library only.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import os
import re
import shutil
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
OPENVERSE_API = "https://api.openverse.org/v1/images/"
OPENVERSE_TOKEN = "https://api.openverse.org/v1/auth_tokens/token/"

DEFAULT_USER_AGENT = (
    "DialASpareHeroAssetQueue/1.0 "
    "(vehicle visual asset provenance workflow; contact configured by operator)"
)

ALLOWED_OPENVERSE_LICENSES = {"cc0", "pdm", "by", "by-sa"}
NEGATIVE_TITLE_TERMS = {
    "interior", "dashboard", "engine", "logo", "badge", "emblem", "diagram",
    "drawing", "sketch", "render", "toy", "model car", "diecast", "wreck",
    "accident", "police", "ambulance", "fire engine", "bus interior",
}
PHOTO_EXTS = {"jpg", "jpeg", "png", "webp"}
BODY_TOKENS = {
    "sedan", "hatch", "hatchback", "suv", "pickup", "bakkie", "van", "minibus",
    "mpv", "wagon", "estate", "coupe", "convertible", "crossover",
}

# Word-boundary matching keeps "toy" from firing on "Toyota" and "nd" on "Nissan".
NEGATIVE_TITLE_RE = re.compile(
    r"\b(?:" + "|".join(re.escape(t) for t in sorted(NEGATIVE_TITLE_TERMS)) + r")\b"
)


@dataclass
class Candidate:
    visual_family_id: str
    priority: str
    make: str
    model_family: str
    query: str
    source: str
    source_id: str
    title: str
    image_url: str
    landing_url: str
    width: int | None
    height: int | None
    mime: str
    creator: str
    creator_url: str
    license: str
    license_url: str
    attribution: str
    score: float
    rank: int = 0
    downloaded_file: str = ""
    sha256: str = ""
    review_status: str = "PENDING"
    rejection_reason: str = ""


def clean_html(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def slug_filename(text: str, max_len: int = 100) -> str:
    text = re.sub(r"[^A-Za-z0-9._-]+", "-", text.strip())
    text = re.sub(r"-+", "-", text).strip("-._")
    return (text[:max_len] or "image")


def request_bytes(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    data: bytes | None = None,
    timeout: int = 45,
    retries: int = 4,
) -> tuple[bytes, dict[str, str]]:
    hdrs = {
        "User-Agent": os.getenv("DIAL_ASSET_USER_AGENT", DEFAULT_USER_AGENT),
        "Accept": "*/*",
    }
    if headers:
        hdrs.update(headers)

    last_error: Exception | None = None
    for attempt in range(retries):
        try:
            req = Request(url, data=data, method=method, headers=hdrs)
            with urlopen(req, timeout=timeout) as resp:
                body = resp.read()
                return body, dict(resp.headers.items())
        except HTTPError as exc:
            last_error = exc
            if exc.code == 429:
                retry_after = exc.headers.get("Retry-After")
                delay = float(retry_after) if retry_after and retry_after.isdigit() else min(30, 2 ** attempt)
            elif 500 <= exc.code <= 599:
                delay = min(30, 2 ** attempt)
            else:
                raise
        except (URLError, TimeoutError) as exc:
            last_error = exc
            delay = min(30, 2 ** attempt)
        time.sleep(delay)
    assert last_error is not None
    raise last_error


def request_json(
    base_url: str,
    params: dict[str, Any] | None = None,
    *,
    headers: dict[str, str] | None = None,
    method: str = "GET",
    form: dict[str, str] | None = None,
) -> dict[str, Any]:
    url = base_url
    data = None
    req_headers = dict(headers or {})
    if params:
        url += ("&" if "?" in url else "?") + urlencode(params, doseq=True)
    if form is not None:
        data = urlencode(form).encode("utf-8")
        req_headers["Content-Type"] = "application/x-www-form-urlencoded"
    body, _ = request_bytes(url, method=method, headers=req_headers, data=data)
    return json.loads(body.decode("utf-8"))


def commons_license_ok(short_name: str, license_url: str) -> bool:
    name = clean_html(short_name).lower().replace("_", " ")
    url = (license_url or "").lower()
    combined = f"{name} {url}"

    # Commercial and transformations are required for Dial transition assets.
    if any(bad in combined for bad in ("noncommercial", "non-commercial", "by-nc", " nc ", "noderivatives", "no-derivatives", "by-nd", " nd ")):
        return False

    if "public domain" in combined or "cc0" in combined or "zero/1.0" in combined:
        return True
    if re.search(r"\bcc[- ]?by[- ]?sa\b", combined) or "attribution-sharealike" in combined:
        return True
    if re.search(r"\bcc[- ]?by\b", combined) or "creativecommons.org/licenses/by/" in combined:
        return True
    return False


def openverse_license_ok(code: str) -> bool:
    return (code or "").lower().strip() in ALLOWED_OPENVERSE_LICENSES


def make_queries(row: dict[str, str]) -> list[str]:
    make = row.get("Make", "").strip()
    model = row.get("Model Family", "").strip()
    generation = row.get("Generation / Platform", "").strip()
    body = row.get("Body Style", "").strip()
    phase = row.get("Facelift / Visual Phase", "").strip()

    body_simple = next((t for t in BODY_TOKENS if t in body.lower()), "")
    queries = []

    specific = " ".join(x for x in (make, model, generation, body_simple) if x)
    if specific:
        queries.append(f"{specific} car")
    if phase and phase.lower() not in {"current", "single family"}:
        # Useful when a source names a facelift explicitly.
        phase_words = re.sub(r"[/–—-]+", " ", phase)
        queries.append(f"{make} {model} {phase_words} car")
    queries.append(f"{make} {model} car")

    deduped = []
    seen = set()
    for q in queries:
        q = re.sub(r"\s+", " ", q).strip()
        key = q.lower()
        if q and key not in seen:
            seen.add(key)
            deduped.append(q)
    return deduped[:3]


def title_tokens(value: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", (value or "").lower()))


CAB_TOKENS = {
    "single": ("single cab", "singlecab", "single-cab"),
    "extended": ("extended cab", "extra cab", "xtra cab", "king cab", "club cab"),
    "double": ("double cab", "dual cab", "crew cab", "doublecab", "double-cab"),
}

YEAR_RE = re.compile(r"\b(19[89]\d|20[0-3]\d)\b")
# Platform codes as they appear in the manifest: AN120, H300, XG10, P703, W205,
# plus letters-only codes such as QY, HBN, TF, KE.
CODE_ALNUM_RE = re.compile(r"\b([A-Z]{1,3}\d{1,4}[A-Z]?)\b")
CODE_ALPHA_RE = re.compile(r"\b([A-Z]{2,3})\b")
CODE_ALPHA_STOPWORDS = {
    "AND", "THE", "SUV", "MPV", "GEN", "ICE", "EV", "PRE", "CAB", "VAN", "GT",
    "DM", "SHS", "MT", "AT", "WD", "NA", "US", "SA", "PLUS", "NEW", "CURRENT",
}


@dataclass
class GenContext:
    """Generation/era signals for one visual family, resolved against siblings."""

    year_start: int | None = None
    year_end: int | None = None
    own_codes: tuple[str, ...] = ()
    sibling_codes: tuple[str, ...] = ()
    own_gens: tuple[int, ...] = ()
    sibling_gens: tuple[int, ...] = ()
    cab: str = ""
    sibling_cabs: tuple[str, ...] = ()
    group_key: str = ""
    # True when a sibling family occupies a separate era, so a candidate with no
    # era evidence at all cannot be attributed to this family.
    era_evidence_required: bool = False


def parse_year_range(value: str) -> tuple[int | None, int | None]:
    text = (value or "").strip().lower()
    if not text:
        return (None, None)
    years = [int(y) for y in YEAR_RE.findall(text)]
    open_ended = any(w in text for w in ("present", "current", "onward", "date"))
    if not years:
        return (None, None)
    start = min(years)
    if open_ended or len(years) == 1:
        # Model-year badges run ahead of calendar production start.
        return (start, time.gmtime().tm_year + 1)
    return (start, max(years))


def extract_platform_codes(value: str) -> list[str]:
    text = (value or "").upper()
    codes: list[str] = []
    for code in CODE_ALNUM_RE.findall(text):
        if code not in codes:
            codes.append(code)
    for code in CODE_ALPHA_RE.findall(text):
        if code in CODE_ALPHA_STOPWORDS or code in codes:
            continue
        codes.append(code)
    return codes


ORDINAL_WORDS = {
    1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth",
    7: "seventh", 8: "eighth", 9: "ninth", 10: "tenth", 11: "eleventh",
}
ORDINAL_SUFFIX = {1: "1st", 2: "2nd", 3: "3rd"}
ORDINAL_RE = re.compile(r"(\d{1,2})\s*(?:st|nd|rd|th)")


def extract_generation_ordinals(value: str) -> list[int]:
    """"2nd generation" / "8th–11th gen" -> the ordinal generations covered."""
    text = (value or "").lower()
    if "gen" not in text:
        return []
    nums = [int(n) for n in ORDINAL_RE.findall(text) if 1 <= int(n) <= 12]
    if len(nums) == 2 and nums[0] < nums[1] and re.search(r"\d\s*(?:st|nd|rd|th)\s*[–—-]", text):
        return list(range(nums[0], nums[1] + 1))
    return sorted(set(nums))


def ordinal_in_title(title: str, ordinal: int) -> bool:
    forms = [ORDINAL_SUFFIX.get(ordinal, f"{ordinal}th"), ORDINAL_WORDS.get(ordinal, "")]
    lower = (title or "").lower()
    return any(
        form and re.search(rf"\b{form}\b[^,;()]{{0,12}}\bgen", lower)
        for form in forms
    )


def detect_cab(value: str) -> str:
    text = (value or "").lower()
    hits = [
        cab
        for cab, phrases in CAB_TOKENS.items()
        if any(p in text for p in phrases) or f"{cab} cab" in text
    ]
    # "Single/Double Cab" families cover both, so no cab signal is usable.
    return hits[0] if len(hits) == 1 else ""


def _phase_kind(phase: str) -> str:
    """pre | post | both | '' — only trust unambiguous single-phase labels."""
    text = (phase or "").lower()
    has_pre = "pre-facelift" in text or "pre facelift" in text
    # "Pre-facelift / facelift" style labels cover both phases in one family.
    spans_both = has_pre and re.search(r"pre[- ]facelift\s*[/]", text) is not None
    if spans_both:
        return "both"
    if has_pre:
        return "pre"
    if "facelift" in text and not has_pre:
        return "post"
    return ""


def build_family_contexts(rows: list[dict[str, str]]) -> dict[str, GenContext]:
    """Resolve each family's era window using its siblings of the same make+model."""
    groups: dict[str, list[dict[str, str]]] = {}
    for row in rows:
        key = f"{row.get('Make','').strip().lower()}|{row.get('Model Family','').strip().lower()}"
        groups.setdefault(key, []).append(row)

    contexts: dict[str, GenContext] = {}
    for key, members in groups.items():
        parsed = []
        for row in members:
            start, end = parse_year_range(row.get("Production Years", ""))
            parsed.append(
                {
                    "row": row,
                    "start": start,
                    "end": end,
                    "codes": extract_platform_codes(row.get("Generation / Platform", "")),
                    "gens": extract_generation_ordinals(row.get("Generation / Platform", "")),
                    "cab": detect_cab(row.get("Body Style", "")),
                    "phase": _phase_kind(row.get("Facelift / Visual Phase", "")),
                }
            )
        for item in parsed:
            row = item["row"]
            start, end = item["start"], item["end"]
            own = list(item["codes"])
            siblings = [p for p in parsed if p is not item]

            # A pre-facelift-only family must not inherit its facelift sibling's years.
            if item["phase"] == "pre" and start is not None:
                caps = [
                    p["start"] - 1
                    for p in siblings
                    if p["phase"] == "post"
                    and p["start"] is not None
                    and p["start"] > start
                    and (not own or not p["codes"] or set(own) & set(p["codes"]))
                ]
                if caps:
                    end = min([e for e in (end, min(caps)) if e is not None])

            sibling_codes = [
                c
                for p in siblings
                for c in p["codes"]
                if c not in own
            ]
            sibling_cabs = [p["cab"] for p in siblings if p["cab"] and p["cab"] != item["cab"]]
            own_gens = list(item["gens"])
            sibling_gens = [g for p in siblings for g in p["gens"] if g not in own_gens]
            contexts[row["Proposed VISUAL_FAMILY_ID"]] = GenContext(
                year_start=start,
                year_end=end,
                own_codes=tuple(own),
                sibling_codes=tuple(dict.fromkeys(sibling_codes)),
                own_gens=tuple(own_gens),
                sibling_gens=tuple(dict.fromkeys(sibling_gens)),
                cab=item["cab"],
                sibling_cabs=tuple(dict.fromkeys(sibling_cabs)),
                group_key=key,
                era_evidence_required=any(
                    start is not None
                    and end is not None
                    and p["start"] is not None
                    and p["end"] is not None
                    and min(end, p["end"]) - max(start, p["start"]) <= 1
                    for p in siblings
                ),
            )
    return contexts


def context_for_row(row: dict[str, str], contexts: dict[str, GenContext] | None) -> GenContext:
    if contexts:
        ctx = contexts.get(row.get("Proposed VISUAL_FAMILY_ID", ""))
        if ctx is not None:
            return ctx
    return build_family_contexts([row])[row["Proposed VISUAL_FAMILY_ID"]]


def title_year(title: str) -> int | None:
    years = [int(y) for y in YEAR_RE.findall(title or "")]
    return min(years) if years else None


def generation_score(title: str, ctx: GenContext) -> float:
    """Reward same-generation evidence; punish clear wrong-generation evidence."""
    upper = (title or "").upper()
    lower = (title or "").lower()
    score = 0.0

    own_hit = any(re.search(rf"\b{re.escape(c)}\b", upper) for c in ctx.own_codes)
    if own_hit:
        score += 15
    else:
        # Only a code that is exclusively a sibling's is evidence of the wrong body.
        for code in ctx.sibling_codes:
            if code in ctx.own_codes:
                continue
            if re.search(rf"\b{re.escape(code)}\b", upper):
                score -= 45
                break

    own_gen_hit = any(ordinal_in_title(title, g) for g in ctx.own_gens)
    if own_gen_hit:
        score += 15
    elif any(ordinal_in_title(title, g) for g in ctx.sibling_gens):
        score -= 45

    year = title_year(title)
    has_era_evidence = own_hit or own_gen_hit or year is not None
    if ctx.era_evidence_required and not has_era_evidence:
        # A sibling family owns a separate era; an undated, uncoded photo could be
        # either one, and a wrong-generation hero is worse than no hero.
        score -= 100

    if year is not None and (ctx.year_start or ctx.year_end):
        start = ctx.year_start if ctx.year_start is not None else year
        end = ctx.year_end if ctx.year_end is not None else year
        if start <= year <= end:
            score += 12
        elif start - 1 <= year <= end + 1:
            # One year of slack for model-year vs calendar-year labelling.
            score -= 6
        else:
            score -= 60

    if ctx.cab:
        for cab in ctx.sibling_cabs:
            if any(p in lower for p in CAB_TOKENS[cab]):
                score -= 20
                break
        if any(p in lower for p in CAB_TOKENS[ctx.cab]):
            score += 6

    return score


def is_relevant(title: str, row: dict[str, str]) -> bool:
    """A hero candidate must name the make and the model family.

    Size and aspect ratio alone were letting unrelated vehicles win a family.
    """
    tokens = title_tokens(title)
    make_tokens = {t for t in re.findall(r"[a-z0-9]+", row.get("Make", "").lower()) if len(t) > 1}
    model_tokens = {
        t for t in re.findall(r"[a-z0-9]+", row.get("Model Family", "").lower()) if len(t) > 1
    }
    if make_tokens and not (tokens & make_tokens):
        return False
    if model_tokens and not (tokens & model_tokens):
        return False
    return True


def score_candidate(
    *,
    title: str,
    width: int | None,
    height: int | None,
    row: dict[str, str],
    ctx: GenContext | None = None,
) -> float:
    title_l = title.lower()
    score = 0.0

    if NEGATIVE_TITLE_RE.search(title_l):
        score -= 50

    make = row.get("Make", "").lower()
    model = row.get("Model Family", "").lower()
    generation = row.get("Generation / Platform", "").lower()
    body = row.get("Body Style", "").lower()

    for token in re.findall(r"[a-z0-9]+", make):
        if len(token) > 1 and token in title_l:
            score += 6
    model_tokens = [t for t in re.findall(r"[a-z0-9]+", model) if len(t) > 1]
    for token in model_tokens:
        if token in title_l:
            score += 8
    gen_tokens = [t for t in re.findall(r"[a-z0-9]+", generation) if len(t) > 2]
    for token in gen_tokens:
        if token in title_l:
            score += 3
    for token in BODY_TOKENS:
        if token in body and token in title_l:
            score += 2

    if width and height:
        if width >= 1600:
            score += 8
        elif width >= 1200:
            score += 5
        elif width >= 900:
            score += 2
        else:
            score -= 8

        ratio = width / max(height, 1)
        # Typical clean vehicle hero frames are landscape-ish.
        if 1.25 <= ratio <= 2.20:
            score += 5
        elif ratio < 0.85 or ratio > 2.8:
            score -= 5

    # Prefer likely photos over overly technical/image-page titles.
    if any(word in title_l for word in ("front", "rear", "side", "three-quarter", "3/4")):
        score += 1

    score += generation_score(title, ctx if ctx is not None else context_for_row(row, None))

    return score


def commons_search(
    row: dict[str, str],
    limit: int = 12,
    enough: int = 3,
    ctx: GenContext | None = None,
) -> list[Candidate]:
    results: list[Candidate] = []
    ctx = ctx if ctx is not None else context_for_row(row, None)

    for query in make_queries(row):
        params = {
            "action": "query",
            "format": "json",
            "formatversion": 2,
            "generator": "search",
            "gsrsearch": query,
            "gsrnamespace": 6,
            "gsrlimit": limit,
            "prop": "imageinfo",
            "iiprop": "url|size|mime|extmetadata",
            "iiurlwidth": 2000,
            "iiextmetadatafilter": (
                "Artist|Credit|LicenseShortName|LicenseUrl|"
                "Attribution|AttributionRequired|UsageTerms"
            ),
        }
        data = request_json(COMMONS_API, params)
        for page in data.get("query", {}).get("pages", []):
            ii = (page.get("imageinfo") or [{}])[0]
            meta = ii.get("extmetadata") or {}
            short_license = clean_html((meta.get("LicenseShortName") or {}).get("value"))
            license_url = clean_html((meta.get("LicenseUrl") or {}).get("value"))
            if not commons_license_ok(short_license, license_url):
                continue

            image_url = ii.get("thumburl") or ii.get("url") or ""
            original_url = ii.get("url") or image_url
            if not image_url:
                continue

            mime = ii.get("mime") or ""
            title = page.get("title", "")
            if not is_relevant(title, row):
                continue
            width = ii.get("thumbwidth") or ii.get("width")
            height = ii.get("thumbheight") or ii.get("height")

            landing = "https://commons.wikimedia.org/wiki/" + page.get("title", "").replace(" ", "_")
            creator = clean_html((meta.get("Artist") or {}).get("value"))
            credit = clean_html((meta.get("Credit") or {}).get("value"))
            attribution = clean_html((meta.get("Attribution") or {}).get("value"))
            if not attribution:
                attribution = "; ".join(x for x in (creator, credit, short_license) if x)

            score = score_candidate(title=title, width=width, height=height, row=row, ctx=ctx)
            results.append(
                Candidate(
                    visual_family_id=row["Proposed VISUAL_FAMILY_ID"],
                    priority=row["Priority"],
                    make=row["Make"],
                    model_family=row["Model Family"],
                    query=query,
                    source="wikimedia_commons",
                    source_id=str(page.get("pageid", "")),
                    title=title,
                    image_url=image_url,
                    landing_url=landing,
                    width=width,
                    height=height,
                    mime=mime,
                    creator=creator,
                    creator_url="",
                    license=short_license,
                    license_url=license_url,
                    attribution=attribution,
                    score=score,
                )
            )
        # Fall through to the broader queries only when the specific one came up short.
        if len(results) >= enough:
            break

    return results


def openverse_token() -> str:
    client_id = os.getenv("OPENVERSE_CLIENT_ID", "").strip()
    client_secret = os.getenv("OPENVERSE_CLIENT_SECRET", "").strip()
    if not (client_id and client_secret):
        return ""
    data = request_json(
        OPENVERSE_TOKEN,
        method="POST",
        form={
            "grant_type": "client_credentials",
            "client_id": client_id,
            "client_secret": client_secret,
        },
    )
    return data.get("access_token", "")


def openverse_search(
    row: dict[str, str],
    *,
    token: str = "",
    limit: int = 12,
    enough: int = 3,
    ctx: GenContext | None = None,
) -> list[Candidate]:
    results: list[Candidate] = []
    ctx = ctx if ctx is not None else context_for_row(row, None)
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    for query in make_queries(row):
        params = {
            "q": query,
            "page_size": min(limit, 20),
            "license_type": "commercial,modification",
            "category": "photograph",
            "mature": "false",
        }
        data = request_json(OPENVERSE_API, params, headers=headers)
        for item in data.get("results", []):
            code = (item.get("license") or "").lower()
            if not openverse_license_ok(code):
                continue
            image_url = item.get("url") or ""
            landing = item.get("foreign_landing_url") or item.get("detail_url") or ""
            if not image_url or not landing:
                continue

            title = item.get("title") or ""
            if not is_relevant(title, row):
                continue
            width = item.get("width")
            height = item.get("height")
            filetype = item.get("filetype") or ""
            mime = f"image/{filetype}" if filetype else ""

            score = score_candidate(title=title, width=width, height=height, row=row, ctx=ctx)
            results.append(
                Candidate(
                    visual_family_id=row["Proposed VISUAL_FAMILY_ID"],
                    priority=row["Priority"],
                    make=row["Make"],
                    model_family=row["Model Family"],
                    query=query,
                    source="openverse",
                    source_id=str(item.get("id", "")),
                    title=title,
                    image_url=image_url,
                    landing_url=landing,
                    width=width,
                    height=height,
                    mime=mime,
                    creator=item.get("creator") or "",
                    creator_url=item.get("creator_url") or "",
                    license=code,
                    license_url=item.get("license_url") or "",
                    attribution=item.get("attribution") or "",
                    score=score,
                )
            )
        if len(results) >= enough:
            break
    return results


def dedupe_key(c: Candidate) -> str:
    """Catch the same photograph indexed by both Commons and Openverse."""
    stem = Path(urlparse(c.image_url).path).stem.lower()
    stem = re.sub(r"^\d+px-", "", stem)
    stem = re.sub(r"[^a-z0-9]+", "", stem)
    if stem:
        return f"file:{stem}"
    return c.image_url or f"{c.source}:{c.source_id}"


def dedupe_candidates(items: Iterable[Candidate]) -> list[Candidate]:
    out: list[Candidate] = []
    seen: set[str] = set()
    for c in sorted(items, key=lambda x: x.score, reverse=True):
        key = dedupe_key(c)
        if key in seen:
            continue
        seen.add(key)
        out.append(c)
    return out


def assign_across_siblings(
    searched: list[tuple[dict[str, str], list[Candidate], list[str]]],
    contexts: dict[str, GenContext],
    *,
    per_family: int,
    min_score: float,
) -> dict[str, list[Candidate]]:
    """Keep sibling generations from all converging on the same photograph.

    Greedy highest-score-first assignment within a make+model group; a file already
    taken by a sibling is not reused, so a family with no distinguishable candidate
    ends up with fewer (or zero) rather than a wrong-generation hero.
    """
    per_family_pool: dict[str, list[Candidate]] = {}
    group_members: dict[str, list[str]] = {}
    for row, found, _errors in searched:
        vfid = row["Proposed VISUAL_FAMILY_ID"]
        pool = [c for c in dedupe_candidates(found) if c.score >= min_score]
        per_family_pool[vfid] = pool
        ctx = contexts.get(vfid)
        group_members.setdefault(ctx.group_key if ctx else vfid, []).append(vfid)

    assigned: dict[str, list[Candidate]] = {vfid: [] for vfid in per_family_pool}
    for members in group_members.values():
        if per_family <= 0:
            continue
        if len(members) == 1:
            vfid = members[0]
            assigned[vfid] = per_family_pool[vfid][:per_family]
            continue

        offers = sorted(
            (
                (c.score, vfid, c)
                for vfid in members
                for c in per_family_pool[vfid]
            ),
            key=lambda t: t[0],
            reverse=True,
        )
        taken: set[str] = set()
        for _score, vfid, cand in offers:
            key = dedupe_key(cand)
            if key in taken or len(assigned[vfid]) >= per_family:
                continue
            taken.add(key)
            assigned[vfid].append(cand)
        for vfid in members:
            assigned[vfid].sort(key=lambda c: c.score, reverse=True)
    return assigned


def extension_for_candidate(c: Candidate) -> str:
    path_ext = Path(urlparse(c.image_url).path).suffix.lower().lstrip(".")
    if path_ext in PHOTO_EXTS:
        return "jpg" if path_ext == "jpeg" else path_ext
    mime = c.mime.lower()
    if "png" in mime:
        return "png"
    if "webp" in mime:
        return "webp"
    return "jpg"


def download_candidate(c: Candidate, dest: Path) -> tuple[str, str]:
    dest.parent.mkdir(parents=True, exist_ok=True)
    body, headers = request_bytes(c.image_url)
    content_type = headers.get("Content-Type", "").lower()
    if content_type and not content_type.startswith("image/"):
        raise RuntimeError(f"Refused non-image response ({content_type}) from {c.image_url}")
    dest.write_bytes(body)
    digest = hashlib.sha256(body).hexdigest()
    return str(dest), digest


def load_manifest(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.DictReader(f))
    required = {
        "Priority", "Make", "Model Family", "Generation / Platform",
        "Body Style", "Facelift / Visual Phase", "Proposed VISUAL_FAMILY_ID",
    }
    missing = required - set(rows[0].keys() if rows else ())
    if missing:
        raise ValueError(f"Manifest missing columns: {', '.join(sorted(missing))}")
    return rows


def write_review_csv(path: Path, candidates: list[Candidate]) -> None:
    fieldnames = [
        "priority", "visual_family_id", "make", "model_family", "rank", "score",
        "source", "title", "query", "downloaded_file", "width", "height",
        "creator", "creator_url", "license", "license_url", "attribution",
        "landing_url", "image_url", "sha256", "review_status", "rejection_reason",
    ]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for c in candidates:
            data = asdict(c)
            writer.writerow({k: data.get(k, "") for k in fieldnames})


def write_family_provenance(family_dir: Path, row: dict[str, str], candidates: list[Candidate]) -> None:
    payload = {
        "visual_family": row,
        "candidates": [asdict(c) for c in candidates],
        "rule": (
            "PENDING candidates are not production-approved. Confirm vehicle visual match, "
            "angle/background suitability, source page, creator, and license before CGI transformation."
        ),
    }
    (family_dir / "provenance.json").write_text(
        json.dumps(payload, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def parse_priorities(value: str) -> set[str]:
    return {x.strip().upper() for x in value.split(",") if x.strip()}


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Build Dial a Spare hero-image candidate folders with provenance."
    )
    ap.add_argument(
        "--manifest",
        default="transition_visual_family_manifest.csv",
        help="CSV manifest exported from the Dial visual-family catalog.",
    )
    ap.add_argument(
        "--out",
        default="hero_queue",
        help="Output directory.",
    )
    ap.add_argument(
        "--priority",
        default="P0",
        help="Comma-separated priorities to process (default: P0). Use P0,P1,P2 for all.",
    )
    ap.add_argument(
        "--sources",
        default="commons,openverse",
        help="commons, openverse, or both comma-separated.",
    )
    ap.add_argument(
        "--candidates-per-family",
        type=int,
        default=3,
        help="Maximum downloaded candidates per visual family.",
    )
    ap.add_argument(
        "--search-limit",
        type=int,
        default=12,
        help="Search results requested per source/query.",
    )
    ap.add_argument(
        "--min-score",
        type=float,
        default=0.0,
        help="Drop candidates with a lower heuristic score.",
    )
    ap.add_argument(
        "--sleep",
        type=float,
        default=0.4,
        help="Polite delay in seconds between visual families.",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Search and write provenance/review CSV, but do not download image bytes.",
    )
    ap.add_argument(
        "--max-families",
        type=int,
        default=0,
        help="For testing: stop after N families (0 = no limit).",
    )
    args = ap.parse_args()

    manifest_path = Path(args.manifest).resolve()
    out_root = Path(args.out).resolve()
    rows = load_manifest(manifest_path)
    contexts = build_family_contexts(rows)

    wanted_priorities = parse_priorities(args.priority)
    sources = {s.strip().lower() for s in args.sources.split(",") if s.strip()}
    unknown_sources = sources - {"commons", "openverse"}
    if unknown_sources:
        raise ValueError(f"Unknown sources: {', '.join(sorted(unknown_sources))}")

    selected = [r for r in rows if r.get("Priority", "").upper() in wanted_priorities]
    if args.max_families > 0:
        selected = selected[: args.max_families]

    out_root.mkdir(parents=True, exist_ok=True)
    token = openverse_token() if "openverse" in sources else ""
    all_candidates: list[Candidate] = []

    print(f"Manifest: {manifest_path}")
    print(f"Families selected: {len(selected)}")
    print(f"Sources: {', '.join(sorted(sources))}")
    print(f"Download mode: {'DRY RUN' if args.dry_run else 'ACTIVE'}")
    if "openverse" in sources:
        print(f"Openverse auth: {'authenticated' if token else 'anonymous'}")

    searched: list[tuple[dict[str, str], list[Candidate], list[str]]] = []

    for idx, row in enumerate(selected, start=1):
        print(f"[{idx}/{len(selected)}] {row['Priority']} {row['Make']} {row['Model Family']}")

        found: list[Candidate] = []
        errors: list[str] = []
        ctx = context_for_row(row, contexts)

        if "commons" in sources:
            try:
                found.extend(
                    commons_search(
                        row, args.search_limit, enough=args.candidates_per_family, ctx=ctx
                    )
                )
            except Exception as exc:
                errors.append(f"commons: {exc}")

        # Always allow Openverse to add candidates if requested; dedupe later.
        if "openverse" in sources:
            try:
                found.extend(
                    openverse_search(
                        row,
                        token=token,
                        limit=args.search_limit,
                        enough=args.candidates_per_family,
                        ctx=ctx,
                    )
                )
            except Exception as exc:
                errors.append(f"openverse: {exc}")

        searched.append((row, found, errors))
        time.sleep(max(0.0, args.sleep))

    assigned = assign_across_siblings(
        searched,
        contexts,
        per_family=max(0, args.candidates_per_family),
        min_score=args.min_score,
    )

    for row, _found, errors in searched:
        vfid = row["Proposed VISUAL_FAMILY_ID"]
        ranked = assigned.get(vfid, [])

        family_dir = out_root / row["Priority"] / vfid
        candidate_dir = family_dir / "candidates"
        candidate_dir.mkdir(parents=True, exist_ok=True)

        for rank, c in enumerate(ranked, start=1):
            c.rank = rank
            ext = extension_for_candidate(c)
            filename = (
                f"{rank:02d}_{c.source}_"
                f"{slug_filename(c.title or row['Make'] + '-' + row['Model Family'])}.{ext}"
            )
            dest = candidate_dir / filename
            if not args.dry_run:
                try:
                    if dest.exists():
                        body = dest.read_bytes()
                        c.downloaded_file = str(dest)
                        c.sha256 = hashlib.sha256(body).hexdigest()
                    else:
                        c.downloaded_file, c.sha256 = download_candidate(c, dest)
                except Exception as exc:
                    c.rejection_reason = f"DOWNLOAD_ERROR: {exc}"
            all_candidates.append(c)

        if not ranked:
            placeholder = Candidate(
                visual_family_id=vfid,
                priority=row["Priority"],
                make=row["Make"],
                model_family=row["Model Family"],
                query=" | ".join(make_queries(row)),
                source="none",
                source_id="",
                title="NO_ACCEPTABLE_CANDIDATE",
                image_url="",
                landing_url="",
                width=None,
                height=None,
                mime="",
                creator="",
                creator_url="",
                license="",
                license_url="",
                attribution="",
                score=-999,
                rejection_reason="; ".join(errors) if errors else "No commercially transformable candidate passed filters.",
            )
            all_candidates.append(placeholder)

        write_family_provenance(family_dir, row, ranked)
        if errors:
            (family_dir / "source_errors.txt").write_text("\n".join(errors), encoding="utf-8")

    review_csv = out_root / "candidate_review.csv"
    write_review_csv(review_csv, all_candidates)

    summary = {
        "families_processed": len(selected),
        "candidate_rows": len(all_candidates),
        "downloaded_candidates": sum(bool(c.downloaded_file) for c in all_candidates),
        "no_candidate_families": sum(c.title == "NO_ACCEPTABLE_CANDIDATE" for c in all_candidates),
        "review_csv": str(review_csv),
    }
    (out_root / "run_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
