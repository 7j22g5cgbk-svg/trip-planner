# Travel App — How To

A short reference for using and updating your travel setup. Keep this somewhere handy.
_Last updated: 2 Sep 2026 — reflects the shared Mac + phone library._

---

## What you have

- **Mac travel tool** — plan trips from your Mac. Free (runs on your Claude subscription).
- **iPhone app** — plan trips anywhere. Uses your Anthropic API key (a few cents per trip).
- **Friends' page** — a read-only view of your curated picks.
- **One shared library** — your saved places live in a single file (`data.js`) that BOTH
  the Mac tool and the iPhone app read. Add once, both see it (after a push).

---

## Your links

- **Your app (plan trips):** https://7j22g5cgbk-svg.github.io/trip-planner/
- **Friends' page (read-only):** https://7j22g5cgbk-svg.github.io/trip-planner/shared/
- **The shared library file:** https://7j22g5cgbk-svg.github.io/trip-planner/shared/data.js

Send friends the **Friends' page** link.

---

## The shared library — how Mac and phone stay in sync

The single source of truth is the file **~/Desktop/trip-planner/shared/data.js**
(published online as the link above).

- The **iPhone app** reads and writes this (via Publish).
- The **Mac tool** READS it (adds your saved places to Mac trips) but does NOT write to it.
- Your old **Google CSVs** still work on the Mac as extra read-only "seed" places.

**The bridge between Mac and phone is always: commit + push in GitHub Desktop.**
They share a file, not a live connection — changes travel when you push.

---

## Everyday routine: add or change a place

**Easiest — add on the phone:**
1. App -> **My Library -> Add** (fill in the **City** — must match what you'd type when
   planning, e.g. `Lisbon`).
2. **My Library -> Backup -> Publish for friends -> Copy.**
3. Put that text into `data.js` — pick one:
   - **Ask Claude Code:** `Replace the contents of ~/Desktop/trip-planner/shared/data.js with what's on my clipboard (pbpaste), then confirm it starts with window.SHARED_LIBRARY.`
   - **By hand:** open `~/Desktop/trip-planner/shared/data.js`, select all, paste, save.
4. **GitHub Desktop** -> short message -> **Commit to main** -> **Push origin**.
5. Now BOTH the phone (on next open) and the Mac (on next trip) include it.

**Or add on the Mac:** edit `~/Desktop/trip-planner/shared/data.js` directly (or ask Claude
Code to), then **commit + push**. Both sides pick it up.

**Golden rule:** after adding/changing places, **push**. Publishing/pushing is also your backup.

---

## Adding a travel source (blogs/sites the AI should favour)

- **Mac tool:** edit `~/Desktop/MUCHIEZ_COCKPIT/travel/sources.md` — add a line under
  "Trusted travel blogs & sites", save. (Open with: `open -e ~/Desktop/MUCHIEZ_COCKPIT/travel/sources.md`)
- **iPhone app:** App -> **My Sources** -> add it there. It's saved with your library and
  travels via Publish/push like everything else.

Note: sources are a *soft* nudge — the AI favours them when it can, but still searches the
wider web and can't use only those sites.

---

## If your phone library ever disappears (after reinstalling)

It restores itself from `data.js` on open — but ONLY if the phone's library is empty at that
moment. It comes back as fresh as your **last push**.

If the phone keeps an old list instead of your latest: **My Library -> Backup -> Import**,
paste the contents of `data.js` (the part inside the outer braces), tap **Load** to overwrite.

---

## Reinstalling / forcing the newest version (iPhone)

1. Delete the app from the home screen.
2. Open the app link in Safari with a fresh tag, e.g. `...trip-planner/?v=16` (change the number).
3. Pull down to refresh -> **Share -> Add to Home Screen**.

---

## Running the Mac tool

- Run it from the **normal Terminal app** (NOT inside Claude Code — it times out there):
  `~/Desktop/MUCHIEZ_COCKPIT/travel/trip_launcher.sh`
- Type your destination, then wait a few minutes — the page opens on its own when done.
- If it ever dies silently right after the destination box, diagnose with:
  `bash -x ~/Desktop/MUCHIEZ_COCKPIT/travel/trip_launcher.sh 2>&1 | tail -30`
  and check `cat ~/Desktop/MUCHIEZ_COCKPIT/travel/last_run.log`.

---

## Good to remember

- **Everyday use never needs the long Claude Code build tickets** — those were one-time.
  Updating is just: add -> publish/edit data.js -> commit -> push.
- Phone trips use your **Anthropic API key** (capped by the spending limit you set).
- The Mac tool is free (your Claude subscription).
- Friends get a **read-only** view. Letting them plan their own trips is still parked
  (your key ~ $12 for two friends, or the free Firecrawl + Gemini build).

---

## Parked ideas (for later)

- Friends generating their own trips (cost vs. free-stack decision).
- An "unpublished changes" reminder in the app.
- A real cloud backend for instant, automatic sync (removes the copy-paste/push step).
- An "Add on Mac" button (the Mac tool currently reads the shared library but doesn't edit it).
