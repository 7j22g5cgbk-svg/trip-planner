# HANDOVER — Travel tooling

**Written:** 2026-09-01 · **For:** a fresh session with no prior context
**Lives in:** `~/Desktop/trip-planner/` · covers this repo **and** `~/Desktop/MUCHIEZ_COCKPIT`

`MUCHIEZ_COCKPIT/STAND.md` assumes you were there. This file does not. It is the cold-start
orientation: what exists, where, what state it is in, and what is unverified.

---

## 1. There are TWO separate git repos

| Repo | Holds | State |
|---|---|---|
| `~/Desktop/MUCHIEZ_COCKPIT` | the desktop brief generator, all tooling, BACKLOG/STAND | uncommitted changes |
| `~/Desktop/trip-planner` | **the phone app — the file that goes online** | `index.html` modified, uncommitted |

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
- Full list of open items: `MUCHIEZ_COCKPIT/BACKLOG.md`. Previous session's
  narrative: `MUCHIEZ_COCKPIT/STAND.md`.
