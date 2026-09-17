# HANDOVER — Travel tooling

**Written:** 2026-09-01 · **Updated:** 2026-09-01 (PWA session) · **For:** a fresh session with no prior context
**Lives in:** `~/Desktop/trip-planner/` · covers this repo **and** `~/Desktop/MUCHIEZ_COCKPIT`

`MUCHIEZ_COCKPIT/STAND.md` assumes you were there. This file does not. It is the cold-start
orientation: what exists, where, what state it is in, and what is unverified.

---

## 1. There are TWO separate git repos

| Repo | Holds | State |
|---|---|---|
| `~/Desktop/MUCHIEZ_COCKPIT` | the desktop brief generator, all tooling, BACKLOG/STAND | uncommitted changes |
| `~/Desktop/trip-planner` | **the phone app — the file that goes online** | `index.html` modified + `manifest.webmanifest`, `sw.js` new — all uncommitted |

A cockpit commit does **not** carry the phone app. Both need their own commit in
GitHub Desktop. Nicole commits manually — never run git commands for her.

**Trap:** two `MUCHIEZ_COCKPIT` folders exist. The real one is
`~/Desktop/MUCHIEZ_COCKPIT`. A near-empty `~/MUCHIEZ_COCKPIT` sits in the home
folder; any command written as `~/MUCHIEZ_COCKPIT` silently hits the wrong one.

---

## 2. Two ways to make a trip brief

### A. Desktop — `MUCHIEZ_COCKPIT/travel/trip_launcher.sh`
Double-click `MUCHIEZ_COCKPIT/tools/Travel.command`, or run the script **from a real Terminal**
(an AppleScript dialog launched from a background process never comes to the
front and blocks invisibly — this cost a whole session once).

Pipeline: dialog asks for a destination → one `claude -p` call returns **one JSON
object** → fences stripped, reduced to the outermost `{ … }`, validated with `jq`
→ **`python3` renders it into finished HTML** and splices it in at the
`/*__TRIP_DATA__*/` token in `MUCHIEZ_COCKPIT/travel/template.html` → written to
`MUCHIEZ_COCKPIT/travel/trips/<sanitized>.html` → copied to
`~/Library/Mobile Documents/com~apple~CloudDocs/Travel/` → opened locally.

Key facts:
- `template.html` is a **pure static shell — zero `<script>` tags**. All markup is
  produced by the python step at build time. That is deliberate: iPhone Quick Look
  does not run JavaScript, and the page used to render blank there.
- Itinerary tabs are hidden radio inputs + labels + `:checked` sibling rules. No JS.
- The iCloud `cp` sits **after** the `__TRIP_DATA__` guard, so a failed build never
  syncs a broken page.
- If `python3` exits non-zero or writes an empty file, the launcher logs to
  `MUCHIEZ_COCKPIT/travel/last_run.log`, shows an alert and exits 1.

**Do not** try to make the page static by editing `template.html` alone. It is
structurally impossible — the built file is just the template with data spliced
in, and CSS cannot parse JSON. The conversion has to happen in the launcher.

**Trap:** macOS bash is 3.2.57 and mis-parses an apostrophe inside the PROMPT
heredoc. A single `item's` once swallowed 30 lines. **No apostrophes in that
prompt.** Always `bash -n` after editing.

### B. Phone — `~/Desktop/trip-planner/index.html`
One self-contained page for mobile Safari (inline CSS+JS, no CDNs, no build step).
Asks for a destination, calls the Anthropic API directly from the browser, renders
the same design. **This is the canonical phone app — edit this file, not the copy.**

Current request parameters (all tuned on 2026-09-01 after the API returned
`stop_reason: "max_tokens"`):

| Setting | Value | Why |
|---|---|---|
| `model` | `claude-sonnet-5` | |
| `max_tokens` | `24000` | output was being truncated |
| web search tool | `web_search_20250305` | the `20260209` variant returns blocks this app does not parse |
| `max_uses` | `6` | search-result text was eating the token budget |
| prompt | hard limits | exactly 3 itineraries, summary ≤ 20 words, why/note/cuisine ≤ 12 words |

Key handling: stored **only** in `localStorage` under `anthropic_key`, never
hardcoded, with a Change/Clear link. The only `sk-ant` string in the file is the
input placeholder. The page talks to exactly one endpoint.

Response parsing, in order: collect every `content[]` block with `type === "text"`
(tool-result blocks ignored) → strip fence markers → **balanced-brace scan** from
the first `{` to its matching `}`, skipping braces inside string literals and
handling escapes → `JSON.parse` only that substring. If `stop_reason` is
`max_tokens`, both failure paths show "Ran out of room — tap Plan again" instead
of a parse error.

**Why the brace scanner exists:** the model sometimes writes prose before the JSON
("Now building the itineraries:"). The old greedy first-`{`-to-last-`}` slice
swallowed trailing prose and broke `JSON.parse`. Do not replace it with a regex.

### C. The phone app is an installable PWA (added 2026-09-01)

`index.html` is now installable to the iPhone home screen and opens offline. Three
files make that work; nothing about the research or rendering path was touched.

| File | Role |
|---|---|
| `manifest.webmanifest` | name/short_name `Travel`, `display: standalone`, theme `#B0553C`, background `#EAF6FF`, 192 + 512 icons marked `any maskable` |
| `sw.js` | app-shell service worker, network-first, cache name `trip-cache-v2026-09-08b` |
| `icon-180/192/512.png` | already present before this session; 180 is the `apple-touch-icon` |

`index.html` gained only a `<head>` block (manifest link, `theme-color`, the
`mobile-web-app-capable` / apple meta tags, `apple-touch-icon`) and a guarded
`serviceWorker.register("./sw.js")` at the end of the existing IIFE. The viewport
meta and `apple-mobile-web-app-capable` were already there and were left alone.

**Every path is relative (`./`), and this is not cosmetic.** The site is served
from a GitHub Pages *subpath* (`username.github.io/trip-planner/`). A single
leading `/` in the manifest, the icons or the register call resolves to the domain
root and 404s — the app silently stops being installable. Never write a leading
slash in these files.

Service worker behaviour (re-read from `sw.js` on 2026-09-16):
- install caches `./`, `./index.html`, `./manifest.webmanifest`, `./icon-180.png`
  and the two `shared/` scripts, then `skipWaiting()`; activate deletes every
  cache whose name is not the current `CACHE` and claims open pages.
- **every** GET is network-first - not just navigations - caching a copy as it
  goes and falling back to cache (then to `./index.html`) only when the network
  fails.
- `api.anthropic.com`, all other cross-origin requests, and every non-GET request
  fall through untouched. **The API is never cached** — a trip brief always comes
  off the live network.

**Corrected 2026-09-16:** this used to warn that the shell was pinned to
`travel-v1` and that you had to bump the cache name with every `index.html`
change. That is no longer true. `sw.js` is now **network-first**
(`CACHE = "trip-cache-v2026-09-08b"`): it always tries the network and only falls
back to cache when offline, so a new build appears without bumping anything. An
online phone therefore *cannot* be stuck on an old build — if the app misbehaves,
the service worker is not the reason, and it is not worth chasing. Verify with
the `APP_BUILD` curl in section 7 instead.

**Trap:** a service worker only registers over HTTPS or on `localhost`. Opening the
file by double-clicking it (`file://`) will never show an install prompt and never
go offline — that is not a bug to chase. Test on the live Pages URL.

---

## 3. API key

Two helpers in `~/.local/bin` (on PATH via `.zshrc`, outside git):

- `anthropic-key` — `get` / `set` / `check` against the login keychain, service
  `anthropic-api-key`, account `$USER`. Same pattern as field-digest, which uses
  `field-digest-anthropic`.
- `anthropic-ping [model]` — one cheap Messages call to verify the key. Passes it
  to curl through a **stdin config file**, not `--header`, so it never appears in
  the process list.

**Nothing is stored yet.** `anthropic-key set` has to be run by Nicole in a
Terminal — it prompts, so the key never enters `argv` or shell history. Never
store it on her behalf with the key on a command line.

The phone app should use a **separate** key (her decision) — `localStorage` is a
second location besides the keychain and is readable by anyone holding the
unlocked phone.

Context for the rotation question, already measured: FileVault **on**, **no** Time
Machine destinations, `~/.claude` is **not** in iCloud or Dropbox, `~/Desktop` is
local (the `Desktop` folder inside CloudDocs is a different inode holding another
machine's desktop). Blast radius of a leaked key is prepaid API credit only — not
the subscription, account, mail or files.

---

## 4. What is verified vs. what is not

**Verified** — renderer run against hostile JSON (ampersands, quotes, `<b>` tags, a
`javascript:` URL, a day with zero stops); brace scanner passed eight cases in
JavaScriptCore; `bash -n` clean; iCloud copy proven with `Zurich__1_day.html`
present in both locations; `anthropic-ping`'s curl mechanism proven with a live
HTTP 200.

**Not verified — this is the honest gap:**
- `trip_launcher.sh` has **never run against live research**, in any session. The
  python renderer has only been exercised with stub JSON.
- The phone app has **never completed a real run** on the iPhone.
- No page has been opened in iPhone Quick Look to confirm the static-HTML fix
  actually solves the blank-page symptom.
- The PWA has **never been installed or opened offline on the iPhone**. The
  manifest is valid JSON and every path was checked to be relative, but no
  service worker has ever registered, cached, or served a request — none of it
  has run anywhere. It has not been pushed to Pages yet.

When testing the phone app, expect **fewer Website buttons** now that searches are
capped at 6 — the prompt correctly writes `""` when it cannot verify a site. That
is the intended trade, not a bug. Judge the Maps buttons instead; those are always
built client-side and can never be missing.

---

## 5. Loose ends

- `MUCHIEZ_COCKPIT/travel/travel_mobile.html` is the original build location of the phone app and
  is now a **stale duplicate** — every fix since the move went only into
  `trip-planner/index.html`. Delete it or archive it, but do not edit it.
- Five older trip pages exist locally but not in iCloud (Lisbon 3d, London 2d,
  London 4d, Amsterdam 1d, Marseille 2d) — the copy step only fires for trips built
  after 2026-08-31. `_preview.html` is a throwaway; skip it.
- `trip-planner` has **no `Backlog.md` or `Stand.md`** of its own; the "Finish"
  routine skips both here. Open items for this repo live in the cockpit's backlog
  or in this file.
- Full list of open items: `MUCHIEZ_COCKPIT/BACKLOG.md`. Previous session's
  narrative: `MUCHIEZ_COCKPIT/STAND.md`.

---

## 6. "Ran out of room" and the HTTP 524 — root cause found 2026-09-16

**One cause, two symptoms: the model was spending its output budget on extended
thinking that this page throws away.**

### The measurement that settled it

Breaking a reply down by content block (loaded library, "Lisbon, 1 day"):

| block type | count | output tokens |
|---|---|---|
| `thinking` | 3 | **3,591** |
| final JSON `text` | 1 | **706** |

Roughly **70-85% of `output_tokens` was thinking.** The page never renders a
thinking block — `planTrip` only ever concatenates `type === "text"` — so every
one of those tokens was generated, billed, waited for, and discarded.

**Why that broke the app.** Thinking counts against `max_tokens` *and* against the
clock (output runs at roughly 100 tokens/second). A bigger saved-places library
makes the model think harder, so thinking grew until it consumed the whole 12,000
cap before the JSON was finished — `stop_reason: "max_tokens"`, JSON cut
mid-string, **"Ran out of room"**. When it finished just slightly faster, it
instead ran past the 95s watchdog or Cloudflare's ~125s cut — **HTTP 524**. Same
cause, different side of the same cliff.

This is why a *one-day* trip could fail: the trigger was library size and thinking
depth, not trip length. It is also why a fresh `?v=N` URL never helped — the
library lives in `localStorage` and survives it.

### The fix

```js
thinking: { type: "disabled" },
```

Sonnet 5 runs **adaptive thinking when the `thinking` parameter is omitted**. The
page had never set it, so it had been thinking by default all along.

Measured on the exact case that was failing (Lisbon, 1 day, full library):

| | time | output_tokens | thinking | result |
|---|---|---|---|---|
| thinking on (the bug) | 124s | 12,584 | ~10,000 | truncated |
| `effort: "low"` | 32s | 2,799 | 1,147 | ok |
| **`thinking: disabled`** | **25.5s** | **2,524** | **0** | ok |

Five times faster, five times smaller — and the *answer itself got longer*
(6,143 characters of JSON vs 3,249), because the whole budget now goes to the
answer instead of to reasoning nobody sees.

`output_config: {effort: "low"}` also works and is the gentler option if a future
change ever needs some reasoning back. Note the Claude API docs warn that
disabling thinking on **Opus 5** can make it write tool calls into visible text;
that caveat is model-specific and does not apply to Sonnet 5, and three
`server_tool_use` blocks fire correctly in every test above.

### Also changed, while in here

- **Dropped `maps` and `route_maps` from the requested JSON.** `mapsFor()` and
  `routeFor()` have always built these client-side, and the built directions link
  is the better one — it carries real waypoints. The model was spending ~30 tokens
  per place re-emitting URLs that were then thrown away. `tools/render_test.js`
  proves offline that every link still appears.
- **One automatic retry** on a genuinely truncated reply, asking for a *leaner*
  answer rather than a bigger budget (`send(dest, key, compact)`).

`SAVED_MAX` stays at **60** and the recommendation counts are unchanged. Both were
cut back at one point while chasing the wrong theory; thinking was the real cause,
so neither needed to be degraded.

### Things that were ruled out, with evidence — do not re-chase

- **A stale deploy.** The live file was fetched and is byte-identical to the repo.
- **The service worker.** It is network-first; an online phone cannot be stale.
- **A parsing bug.** `"Ran out of room"` has only two call sites, both gated on a
  real `stop_reason === "max_tokens"`, and `extractJsonObject` is a correct
  string-aware brace scanner. The JSON really was cut off.
- **Raising `max_tokens`.** Tried: 16,000 turned truncation into an HTTP 524,
  because time scales with tokens generated. Raising the cap is the wrong lever.
- **Fewer searches.** `max_uses: 2` and even `1` still ran past 125s. Search count
  was never the cost; thinking was. *(Re-measured 2026-09-17 with thinking off —
  see section 9. Search count is not the cause of a 524, and that stands, but it
  is not free either: it was simply invisible next to a 60s thinking bill.)*
- **Streaming.** Still off, still reverted, and never the cause of any of this —
  every failure above was measured on the reverted non-streaming build.

## 7. Deploy flow — trip-planner is the only source of truth

`MUCHIEZ_COCKPIT` is a different repo. Nothing in it is served to anyone. The
phone app is **only** `~/Desktop/trip-planner/index.html`, published by GitHub
Pages from `main`.

1. Edit `index.html` (or work on `index-candidate.html` and copy it over).
2. Bump `APP_BUILD` in the same edit.
3. **Run the suite and let it pass** — see section 8.
4. `git commit` and `git push origin main`.
5. Wait for the Pages rebuild, then verify what is actually live:

```sh
curl -s "https://7j22g5cgbk-svg.github.io/trip-planner/index.html?cb=$(date +%s)" \
  | grep -o 'APP_BUILD = "[^"]*"'
```

If that stamp has not changed, the deploy has not landed — do not start debugging
the app. The stamp is also shown in the page footer, so the live version can be
read off a phone at a glance.

**Rollback in one step.** Every good build is tagged:

```sh
git tag -l 'good-*'                          # list known-good builds
git checkout good-2026-09-15a -- index.html  # restore that file
git commit -m "roll back to good-2026-09-15a" && git push origin main
```

Tag a build `good-<APP_BUILD>` as soon as the suite passes against it live.

---

## 8. The regression suite

`tools/trip_test.py` runs real trips against the live backend and asserts each
one would actually **render**, not merely return HTTP 200. It reproduces the
client's own pipeline (concatenate text blocks, strip `<cite>`, scan for the
first balanced `{ ... }`, check the shape the renderer needs) and fails any run
slower than the client watchdog.

It cannot drift from the app: `tools/extract_prompt.js` pulls `buildPrompt()`
out of `index.html` and runs it under JavaScriptCore, and `max_tokens`,
`max_uses`, `REQUEST_TIMEOUT_MS`, `SAVED_MAX` and `PREF_MAX` are all read from
the file under test.

`tools/retry_budget_test.js` is the companion that costs **no API credit** — it
reads the timeout constants out of `index.html` and proves the truncation retry
can never stack two long requests. Run it on every edit to the request path:

```sh
jsc tools/retry_budget_test.js -- index.html
```

```sh
# the password lives in the login keychain
security add-generic-password -s trip-planner-password -a "$USER" -W

python3 tools/trip_test.py                         # full matrix, 6 trips
python3 tools/trip_test.py --tier short            # quick check
python3 tools/trip_test.py --loaded                # simulate a full library
python3 tools/trip_test.py --index index-candidate.html   # test a candidate
python3 tools/render_test.js                       # see below
```

`--loaded` is the important one: an empty library hides the bug entirely.

`tools/render_test.js` is an offline companion (no network, no API credit) that
proves the page still builds every map link now that the model stops sending
them: `jsc tools/render_test.js -- index.html`.

**Two traps when testing:**

- Cloudflare rejects the Python stdlib User-Agent with `403 error code: 1010`
  before the Worker ever runs. The suite sends a browser UA for this reason. A
  403 here is not a bad password — a bad password is a 401.
- The Worker allows **40 trip requests per day for everyone** (`DAILY_LIMIT` in
  `worker.js`). A full matrix is 6 of them. Budget accordingly; the cap is shared
  with real users.

---

---

## 9. The speed pass — build 2026-09-17b

Section 6 fixed *correctness* (trips complete and parse). This pass is about the
remaining symptom: heavy trips occasionally crossing the client watchdog and
showing **"That took too long"** for research that would have finished.

### What was measured

"Lisbon, 1 day" with a full library (60 saved / 15 likes / 15 dislikes), thinking
already disabled:

| `max_uses` | wall time | input tokens | output tokens | result |
|---|---|---|---|---|
| 3 (old) | 29.1s | 57,129 | 2,924 | complete |
| 2 (new) | 26.6s | 26,670 | 2,924 | complete |

The headline is that **the median heavy trip takes ~27s, not ~95s.** Nothing was
near the watchdog. So the watchdog was not firing on a slow median — it was
firing on the tail of `web_search` round-trips, which is exactly the kind of
failure that reads as "occasionally".

That reframes both levers: dropping a search removes one tail draw from the
critical path (and halves the input tokens for free — same 2,924 output tokens,
so the trip that comes back is no smaller), and raising the watchdog covers the
tail that is left.

### The three changes

| change | from | to |
|---|---|---|
| `web_search max_uses` | 3 | **2** |
| `REQUEST_TIMEOUT_MS` | 95,000 | **110,000** |
| retry budget | none — a fresh watchdog per attempt | **`PLAN_BUDGET_MS` = 115,000, shared** |

### The retry *could* stack — it does now not

This was a real bug, confirmed in the code rather than in the wild. `tooLong()`
called `send(dest, key, true)` for a truncated reply, and the retry started its
**own** full-length watchdog. A first attempt that was slow *and* truncated
therefore bought a second full wait: 95 + 95 = **~190s** of spinner, which a user
reads as a hang. Raising the timeout alone would have made that 110 + 110 = 220s.

`planTrip()` now stamps a single `deadline` (`Date.now() + PLAN_BUDGET_MS`) that
both attempts share. Each attempt's watchdog is `min(REQUEST_TIMEOUT_MS, deadline
- now)`, and the retry is skipped entirely when less than `RETRY_MIN_MS` (30s)
remains — a slow-then-truncated first attempt now shows "Ran out of room"
immediately instead of buying a second wait. Worst-case total wall time is
**115s, whatever the first attempt did**, which `tools/retry_budget_test.js`
proves by sweeping every instant the first attempt could truncate at.

### An HTTP 524 now reads as a timeout

110s is under Cloudflare's cut (~125s, section 6). But if that cut is ever nearer
100s on some path, the old code would have turned a clean "That took too long"
into a baffling "The API returned an error (HTTP 524)". A 524/504 is the same
event as the watchdog firing, so it now says the same thing. `REQUEST_TIMEOUT_MS`
is the number to lower if a 524 ever shows up at ~100s.

### Live results, 2026-09-17 (all with a full library)

| case | time | out tokens | result |
|---|---|---|---|
| Lisbon, 1 day ×3 | 27.5s / 31.3s / 29.8s | 2,580–2,861 | pass |
| Rome, 3 days | 36.4s | 3,934 | pass |
| New York, 7 days | 38.4s | 3,516 | **FAIL — see section 10** |
| New York, 7 days (after the 10 fix) | 44.4s | 4,426 | pass |

**The watchdog question is settled.** The slowest trip measured all day was
44.4s against a 110s watchdog — 2.5× headroom. No run came within 65s of the
limit, and nothing produced a 524.

---

## 10. The `<cite>` leak — "Could not read the trip data", found 2026-09-17

Found while verifying section 9, on **"New York, 7 days"** with a full library:
`stop_reason: end_turn`, 3,516 of 12,000 tokens, finished in 38.4s. Nothing was
truncated and nothing was slow — the reply was simply **unparseable**.

### Cause

The model writes web-search citations *inside* JSON string values:

```json
"note":"<cite index=\"3-1\">Modern-luxe boutique hotel Williamsburg was
named best</cite>Great rooftop"
```

The old cleanup removed only the **tags**:

```js
raw = raw.replace(/<\/?cite\b[^>]*>/gi, "");   /* comment claimed the content too */
```

That leaves the quoted source text sitting in the string — with the raw newlines
and quote marks it came with, both illegal inside a JSON string. `JSON.parse`
dies on a perfectly complete reply and the page shows **"Could not read the trip
data"**. The comment above that line always claimed it stripped
`<cite ...>...</cite>`; the regex never did.

### Fix

Remove the element *and* its content, then mop up any unpaired tag. The first
rule is deliberately non-greedy so it cannot swallow the rest of the reply:

```js
raw = raw.replace(/<cite\b[^>]*>[\s\S]*?<\/cite>/gi, "");
raw = raw.replace(/<\/?cite\b[^>]*>/gi, "");
```

`tools/trip_test.py` mirrors both rules, or it would stop reproducing the client.

### Why this hid for so long, and what is still owed

**Citations are stochastic.** The re-run after the fix passed — but it came back
with *zero* cite tags, so it did **not** exercise the fix; the old rule would
have parsed it too. Two consequences:

- The fix is proven **offline**: `tools/cite_parse_test.js` builds the real
  failure shape and the pre-fix file fails 6 of its 9 checks. That is solid.
- It is **not yet confirmed live** against a cite-bearing reply. Still owed:
  re-run `--case "New York, 7 days" --loaded` until a run whose
  `raw_pre_cite` actually contains `<cite`, and confirm it passes.

The diagnosis is also circumstantial on one point: the harness was storing only
the first 4,000 characters of the *post*-strip text, so the failing reply's
original text was never captured. The evidence is that the surviving fragment
showed `"note":"` followed by a newline and citation-style prose — exactly what
tag-only stripping produces. `trip_test.py` now keeps the full text **and** a
`raw_pre_cite` copy, so the next occurrence is diagnosable in one look.

### Offline suite — no API credit, run on every edit to the request path

```sh
jsc tools/retry_budget_test.js -- index.html   # retry cannot stack
jsc tools/cite_parse_test.js   -- index.html   # cite-laden replies still parse
jsc tools/render_test.js       -- index.html   # map links still build
```

Do not tag `good-2026-09-17b` until a cite-bearing New York run passes live.
