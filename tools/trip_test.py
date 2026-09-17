#!/usr/bin/env python3
"""
Trip Planner regression suite - runs real trips against the LIVE backend and
asserts each one would actually render in the app.

This must pass BEFORE any deploy to the live app. See HANDOVER.md section 7.

It mirrors the client on purpose:
  - the prompt is extracted from index.html itself (tools/extract_prompt.js),
    so the test can never drift from what the app sends;
  - the response is parsed with the same steps index.html uses (concatenate
    text blocks, strip <cite> tags, scan for the first balanced { ... }),
    so a pass here means the app renders it, not merely that the API answered.

Usage:
  TRIP_PASSWORD=... python3 tools/trip_test.py                  # full matrix
  TRIP_PASSWORD=... python3 tools/trip_test.py --tier short     # subset
  TRIP_PASSWORD=... python3 tools/trip_test.py --max-tokens 20000 --max-uses 3
  TRIP_PASSWORD=... python3 tools/trip_test.py --case "Lisbon, 1 day" --dump-raw

Exit code 0 = every case passed.
"""

import argparse, json, os, re, subprocess, sys, time, urllib.request, urllib.error

REPO      = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX     = os.path.join(REPO, os.environ.get("TRIP_INDEX", "index.html"))
EXTRACTOR = os.path.join(REPO, "tools", "extract_prompt.js")
JSC       = ("/System/Library/Frameworks/JavaScriptCore.framework"
             "/Versions/A/Helpers/jsc")

API_URL      = "https://trip-backend.fhy5byhvk9.workers.dev"
ORIGIN       = "https://7j22g5cgbk-svg.github.io"
# Cloudflare's edge rejects the stdlib User-Agent with 403 "error code: 1010"
# before the Worker ever runs. The app is a browser, so the test presents as
# one too - otherwise we measure Cloudflare, not the trip.
USER_AGENT   = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                "Version/18.0 Safari/605.1.15")
MODEL        = "claude-sonnet-5"
# Defaults only. WATCHDOG_S is re-read from the file under test in main(), so
# the suite always judges a run against the watchdog that file actually ships.
WATCHDOG_S   = 110    # REQUEST_TIMEOUT_MS in index.html
CLOUDFLARE_S = 125    # the limit a 524 comes from

CASES = [
    ("short",  "Lisbon, 1 day"),
    ("short",  "Paris, 2 days"),
    ("medium", "Rome, 3 days"),
    ("medium", "Barcelona, 4 days"),
    ("long",   "Tokyo, 5 days"),
    ("long",   "New York, 7 days"),
]


# ---------- the app's own prompt ----------

def build_prompt(dest, saved=0, likes=0, dislikes=0):
    out = subprocess.run([JSC, EXTRACTOR, "--", INDEX, dest,
                          str(saved), str(likes), str(dislikes)],
                         capture_output=True, text=True)
    if out.returncode != 0 or out.stdout.startswith("ERROR"):
        raise RuntimeError("prompt extraction failed: %s%s"
                           % (out.stdout, out.stderr))
    return json.loads(out.stdout.strip())


# ---------- the app's own response handling (index.html) ----------

def extract_json_object(s):
    """Port of extractJsonObject() - first balanced { ... }, string-aware."""
    start = s.find("{")
    if start == -1:
        return ""
    depth, in_str, escaped = 0, False, False
    for i in range(start, len(s)):
        ch = s[i]
        if in_str:
            if escaped:      escaped = False
            elif ch == "\\": escaped = True
            elif ch == '"':  in_str = False
            continue
        if ch == '"':
            in_str = True
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return s[start:i + 1]
    return ""


def client_parse(data, max_uses=0):
    """Reproduce what index.html does with a successful response body.
    Returns (trip_or_None, raw_text, failure_reason_or_None)."""
    blocks = [b for b in (data.get("content") or []) if isinstance(b, dict)]
    parts = [b.get("text", "") for b in blocks
             if b.get("type") == "text" and isinstance(b.get("text"), str)]
    raw = "\n".join(parts).strip()

    # Mirror the runaway-search detector. Without this the harness reports a
    # paused turn as the cite bug's message and hides the real failure.
    search_calls = len([b for b in blocks
                        if b.get("type") == "server_tool_use"
                        and b.get("name") == "web_search"])
    search_errors = len([b for b in blocks
                         if b.get("type") == "web_search_tool_result"
                         and isinstance(b.get("content"), dict)
                         and b["content"].get("type") == "web_search_tool_result_error"])
    ran_away = search_errors > 0 or (max_uses > 0 and search_calls > max_uses)
    # Mirror index.html exactly: the cite ELEMENT and its content, then any
    # unpaired tag. Removing only the tags leaves the quoted source text inside
    # the JSON string, newlines and all, and the parse dies on a complete reply.
    raw = re.sub(r"<cite\b[^>]*>.*?</cite>", "", raw, flags=re.I | re.S)
    raw = re.sub(r"</?cite\b[^>]*>", "", raw, flags=re.I)

    # An unfinished turn has nothing complete to render, whatever text it
    # carries, so this is decided before any parsing - exactly as the page does.
    if data.get("stop_reason") == "pause_turn":
        return None, raw, "Search ran long on this trip"

    truncated = data.get("stop_reason") == "max_tokens"

    if not raw:
        if truncated:
            return None, raw, "Ran out of room"
        return None, raw, ("Search ran long on this trip" if ran_away
                           else "Empty answer")

    candidate = extract_json_object(re.sub(r"```[a-zA-Z]*", " ", raw))
    if not candidate:
        candidate = extract_json_object(raw)
    try:
        trip = json.loads(candidate)
    except Exception:
        trip = None

    if not isinstance(trip, dict):
        if truncated:
            return None, raw, "Ran out of room"
        return None, raw, ("Search ran long on this trip" if ran_away
                           else "Could not read the trip data")
    return trip, raw, None


def check_shape(trip):
    """The fields the renderer actually needs. Returns a list of problems."""
    problems = []
    for key in ("destination", "summary", "hotels", "itineraries",
                "restaurants", "sights"):
        if key not in trip:
            problems.append("missing key: %s" % key)
    its = trip.get("itineraries")
    if isinstance(its, list):
        if len(its) != 3:
            problems.append("expected 3 itineraries, got %d" % len(its))
        for n, it in enumerate(its, 1):
            if not isinstance(it, dict):
                problems.append("itinerary %d is not an object" % n)
                continue
            days = it.get("days")
            if not isinstance(days, list) or not days:
                problems.append("itinerary %d has no days" % n)
                continue
            for d in days:
                if not isinstance(d, dict) or not isinstance(d.get("stops"), list):
                    problems.append("itinerary %d has a day with no stops list" % n)
                    break
    elif its is not None:
        problems.append("itineraries is not a list")
    for key in ("hotels", "restaurants", "sights"):
        v = trip.get(key)
        if v is not None and not isinstance(v, list):
            problems.append("%s is not a list" % key)
        elif isinstance(v, list) and not v:
            problems.append("%s is empty" % key)
    return problems


# ---------- one case ----------

def run_case(dest, password, max_tokens, max_uses, timeout,
             saved=0, likes=0, dislikes=0, thinking=None):
    body = {
        "model": MODEL,
        "max_tokens": max_tokens,
        "tools": [{"type": "web_search_20250305", "name": "web_search",
                   "max_uses": max_uses}],
        "messages": [{"role": "user",
                      "content": build_prompt(dest, saved, likes, dislikes)}],
    }
    # Mirror the page's thinking setting. Sonnet 5 thinks by default when this
    # is omitted, and that thinking is what used to blow the token cap - so a
    # test that left it out would not be testing the app.
    if thinking:
        body["thinking"] = {"type": thinking}
    req = urllib.request.Request(
        API_URL, method="POST",
        data=json.dumps(body).encode("utf-8"),
        headers={"content-type": "application/json",
                 "x-trip-password": password,
                 "origin": ORIGIN,
                 "user-agent": USER_AGENT})

    rec = {"dest": dest, "max_tokens": max_tokens, "max_uses": max_uses,
           "library": "%d saved / %d likes / %d dislikes" % (saved, likes, dislikes),
           "thinking": thinking or "(default: adaptive)",
           "pass": False, "status": None, "stop_reason": None,
           "input_tokens": None, "output_tokens": None, "seconds": None,
           "reason": None, "raw": None, "searches": None}

    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            rec["status"] = r.status
            text = r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        rec["status"]  = e.code
        rec["seconds"] = round(time.time() - t0, 1)
        detail = e.read().decode("utf-8", "replace")[:400]
        rec["reason"]  = "HTTP %d: %s" % (e.code, detail)
        return rec
    except Exception as e:
        rec["seconds"] = round(time.time() - t0, 1)
        rec["reason"]  = "transport: %s" % e
        return rec
    rec["seconds"] = round(time.time() - t0, 1)

    try:
        data = json.loads(text)
    except Exception:
        rec["reason"] = "response was not valid JSON"
        rec["raw"] = text[:2000]
        return rec

    usage = data.get("usage") or {}
    rec["stop_reason"]   = data.get("stop_reason")
    rec["input_tokens"]  = usage.get("input_tokens")
    rec["output_tokens"] = usage.get("output_tokens")
    rec["searches"] = len([b for b in (data.get("content") or [])
                           if isinstance(b, dict)
                           and b.get("type") == "server_tool_use"])

    trip, raw, failure = client_parse(data, max_uses)
    # Full text, not a 4000-char sample: a parse failure is unreadable without
    # the part that broke, and that is rarely in the first 4000 characters.
    rec["raw"] = raw
    rec["raw_pre_cite"] = "\n".join(
        b.get("text", "") for b in (data.get("content") or [])
        if isinstance(b, dict) and b.get("type") == "text"
        and isinstance(b.get("text"), str))
    if failure:
        rec["reason"] = 'app would show "%s"' % failure
        return rec

    problems = check_shape(trip)
    if problems:
        rec["reason"] = "; ".join(problems)
        return rec

    # A response that finishes inside the watchdog is the only one a phone sees.
    if rec["seconds"] > WATCHDOG_S:
        rec["reason"] = ("completed in %ss - past the %ss client watchdog"
                         % (rec["seconds"], WATCHDOG_S))
        return rec

    rec["pass"] = True
    return rec


# ---------- driver ----------

def get_password():
    pw = os.environ.get("TRIP_PASSWORD")
    if pw:
        return pw.strip()
    try:
        out = subprocess.run(
            ["security", "find-generic-password", "-s", "trip-planner-password",
             "-a", os.environ.get("USER", ""), "-w"],
            capture_output=True, text=True)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except Exception:
        pass
    sys.exit("No password. Set TRIP_PASSWORD=... or store it with:\n"
             "  security add-generic-password -s trip-planner-password "
             "-a \"$USER\" -w")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--tier", choices=["short", "medium", "long"])
    p.add_argument("--case", action="append",
                   help="run one destination (repeatable)")
    p.add_argument("--max-tokens", type=int, default=None,
                   help="override; default reads max_tokens from index.html")
    p.add_argument("--max-uses", type=int, default=None,
                   help="override; default reads web_search max_uses from index.html")
    p.add_argument("--timeout", type=int, default=CLOUDFLARE_S + 20)
    p.add_argument("--repeat", type=int, default=1)
    p.add_argument("--saved", type=int, default=0,
                   help="simulate a device with N saved places (cap 60)")
    p.add_argument("--likes", type=int, default=0,
                   help="simulate N liked places (cap 15)")
    p.add_argument("--dislikes", type=int, default=0,
                   help="simulate N disliked places (cap 15)")
    p.add_argument("--loaded", action="store_true",
                   help="shorthand for a full library: --saved 60 --likes 15 --dislikes 15")
    p.add_argument("--thinking", default=None,
                   help="override; default reads the thinking type from index.html")
    p.add_argument("--dump-raw", action="store_true")
    p.add_argument("--index", default=None,
                   help="test a candidate file instead of index.html")
    p.add_argument("--out", default=None, help="write full results as JSON")
    a = p.parse_args()
    global INDEX
    if a.index:
        INDEX = a.index if os.path.isabs(a.index) else os.path.join(REPO, a.index)

    src = open(INDEX, encoding="utf-8").read()
    print("  file        %s" % os.path.basename(INDEX))
    if a.max_tokens is None:
        m = re.search(r"max_tokens:\s*(\d+)", src)
        a.max_tokens = int(m.group(1)) if m else 12000
    if a.max_uses is None:
        m = re.search(r"max_uses:\s*(\d+)", src)
        a.max_uses = int(m.group(1)) if m else 3
    build = re.search(r'APP_BUILD\s*=\s*"([^"]+)"', src)
    global WATCHDOG_S
    m = re.search(r"REQUEST_TIMEOUT_MS\s*=\s*(\d+)", src)
    if m:
        WATCHDOG_S = int(m.group(1)) // 1000
    if a.thinking is None:
        m = re.search(r'thinking:\s*\{\s*type:\s*"([a-z]+)"', src)
        a.thinking = m.group(1) if m else None
    # --loaded means "a device whose library is full", so it has to follow the
    # caps the file under test actually enforces, not a hard-coded number.
    if a.loaded:
        m = re.search(r"SAVED_MAX\s*=\s*(\d+)", src)
        a.saved = int(m.group(1)) if m else 60
        m = re.search(r"PREF_MAX\s*=\s*(\d+)", src)
        pref = int(m.group(1)) if m else 15
        a.likes = a.dislikes = pref

    if a.case:
        cases = [("custom", c) for c in a.case]
    else:
        cases = [c for c in CASES if not a.tier or c[0] == a.tier]
    cases = [c for c in cases for _ in range(a.repeat)]

    pw = get_password()
    print("Trip Planner regression suite")
    print("  build       %s" % (build.group(1) if build else "?"))
    print("  max_tokens  %d      web_search max_uses  %d"
          % (a.max_tokens, a.max_uses))
    print("  watchdog    %ss" % WATCHDOG_S)
    print("  library     %d saved / %d likes / %d dislikes%s"
          % (a.saved, a.likes, a.dislikes,
             "   (fresh device)" if not (a.saved or a.likes or a.dislikes) else ""))
    print("  thinking    %s" % (a.thinking or "(omitted -> adaptive)"))
    print("  cases       %d\n" % len(cases))

    results = []
    for tier, dest in cases:
        sys.stdout.write("  %-18s " % dest); sys.stdout.flush()
        rec = run_case(dest, pw, a.max_tokens, a.max_uses, a.timeout,
                       a.saved, a.likes, a.dislikes, a.thinking)
        rec["tier"] = tier
        results.append(rec)
        print("%s  stop=%-11s out=%-6s in=%-7s %ss%s"
              % ("PASS" if rec["pass"] else "FAIL",
                 rec["stop_reason"], rec["output_tokens"],
                 rec["input_tokens"], rec["seconds"],
                 "" if rec["pass"] else "\n      -> %s" % rec["reason"]))
        if a.dump_raw and rec.get("raw"):
            print("      --- raw ---")
            print("      " + rec["raw"].replace("\n", "\n      "))

    ok = sum(1 for r in results if r["pass"])
    outs = [r["output_tokens"] for r in results if r["output_tokens"]]
    print("\n  %d/%d passed" % (ok, len(results)))
    if outs:
        print("  output_tokens: max %d, cap %d, headroom %d (%.0f%%)"
              % (max(outs), a.max_tokens, a.max_tokens - max(outs),
                 100.0 * (a.max_tokens - max(outs)) / a.max_tokens))
    secs = [r["seconds"] for r in results if r["seconds"]]
    if secs:
        print("  slowest: %ss (watchdog %ss)" % (max(secs), WATCHDOG_S))

    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=2)
        print("  full results -> %s" % a.out)

    sys.exit(0 if ok == len(results) else 1)


if __name__ == "__main__":
    main()
