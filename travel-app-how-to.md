# Travel App — How To

A short reference for using and updating your travel setup. Keep this somewhere handy.
_Last updated: 6 Sep 2026 — the Mac tool is retired; saved Google places are now in the app._

---

## What you have

- **iPhone app** — plan trips anywhere. Opens from your home screen.
- **Friends' page** — a read-only view of your curated picks.
- **Your library** — the places you save in the app, published to `shared/data.js`.
- **Your Google Maps places** — 496 places from 24 saved lists, used automatically
  when you plan a trip to one of those cities.

> **The Mac tool is gone (Sep 2026).** `trip_launcher.sh` and the whole
> `MUCHIEZ_COCKPIT/travel/` folder were retired — the phone app does the same job
> better. `tools/Travel.command` is a dead button; ignore or delete it.
> To plan from the Mac, just open the app link below in a browser.

---

## Your links

- **Your app (plan trips):** https://7j22g5cgbk-svg.github.io/trip-planner/
- **Friends' page (read-only):** https://7j22g5cgbk-svg.github.io/trip-planner/shared/
- **Your published library:** https://7j22g5cgbk-svg.github.io/trip-planner/shared/data.js

Send friends the **Friends' page** link.

---

## How updates reach your phone

The app fetches the current version every time you open it with internet, so
**changes appear on their own** — no reinstalling. Only two things to know:

- If the app is already open, close it fully and reopen.
- With no signal you get the last cached copy until you're back online.

**The bridge is always: commit + push in GitHub Desktop.** Phone and Mac share a
file, not a live connection — changes travel when you push.

---

## Everyday routine: add or change a place

1. App → **My Library → Add** (fill in the **City** — it must match what you'd type
   when planning, e.g. `Lisbon`).
2. **My Library → Backup → Publish for friends → Copy.**
3. Put that text into `shared/data.js` — pick one:
   - **Ask Claude Code:** `Replace the contents of ~/Desktop/trip-planner/shared/data.js with what's on my clipboard (pbpaste), then confirm it starts with window.SHARED_LIBRARY.`
   - **By hand:** open `~/Desktop/trip-planner/shared/data.js`, select all, paste, save.
4. **GitHub Desktop** → short message → **Commit to main** → **Push origin**.

**Golden rule:** after adding or changing places, **push**. Publishing and pushing
is also your backup.

> Don't hand-edit `shared/data.js` to add places. It's a published snapshot — your
> next **Publish** overwrites whatever you typed in there. Add in the app instead.

---

## Your saved Google Maps places

Your Google Maps lists live in `shared/maps-places.js` — 496 places across 24 city
lists. When you plan a trip, the app matches the destination against those list
names and hands your own places to the researcher to feature and mark ★.

- **It's automatic.** Type "Milan, 3 days" and your 36 saved Milan places go along.
- **Your notes travel with them.** Where you wrote something in Google Maps, the
  researcher gets your wording. Annotated places are always used first.
- **Cities you have lists for:** Brazil, Brussels, Buenos Aires, Elsass, Kenya, Lech,
  Lisbon, Madeira, Milan, New Orleans, Padua, Paris, Patagonia, Piemonte/Alba,
  Provence, Puglia, Rome, Saint Louis, San Diego, Sofia, Venice, Vienna, Wolkenstein.
- A destination with no list simply plans as normal.

**These are separate from your app library** and don't show under My Library. The
library is your hand-curated list; this is the bulk import from Google.

**After a new Google Takeout export** (takeout.google.com → Maps "your places" +
Saved), unzip it and run in the `trip-planner` folder:

```
python3 tools/build_maps_places.py ~/Downloads/Gespeichert
```

Then commit + push. The CSVs stay out of Git on purpose; only the generated file ships.

_Not included:_ the catch-all "Gespeicherte Orte" list (88 places). It spans many
cities with no city to match on, so it can't be tied to a trip.

---

## Your trusted sources

Your blogs — Yolo Journal, Michelin, Falstaff, NYT Travel, Condé Nast, Forbes,
Bloomberg, The Economist — are built into the research prompt and weighted above
general web results.

**There is no "My Sources" screen in the app.** (An earlier version of this file said
there was; there never was one.) To change the list, edit `index.html` — ask Claude
Code, it's one line — then commit + push.

Sources are a *soft* nudge: the AI favours them when it can, but still searches the
wider web and can't use only those sites.

---

## The access password

The app asks for an **access password**, not an API key. Your Anthropic key lives on
a small server (`trip-backend...workers.dev`) that the app talks to; the phone only
ever stores the shared password, in that browser.

This means no API key sits on your phone, and the password can be changed on the
server without touching the app.

---

## If your phone library ever disappears (after reinstalling)

It restores itself from `data.js` on open — but ONLY if the phone's library is empty
at that moment. It comes back as fresh as your **last push**.

If the phone keeps an old list instead of your latest: **My Library → Backup →
Import**, paste the contents of `data.js` (the part inside the outer braces), tap
**Load** to overwrite.

---

## Checking the phone is current (30 seconds)

Two things now tell you the truth on the phone itself, on the main screen:

- **Under the Destination box** — a small grey line. With the box empty it reads
  `496 saved Google places · 24 city lists ready`. Type `Milan` and it changes to
  `★ 36 of your saved Milan places go with this trip`. That line IS the proof
  Places is working — no need to plan a trip to find out.
  If it reads **"Saved Google places NOT loaded on this device"** in red, the
  phone is running old code. Close the app fully (swipe it away) and reopen.
- **At the bottom** — `build 2026-09-07`. If the Mac shows a newer date than the
  phone, the phone is stale.

The app now also checks for a new version every time you bring it back to the
foreground, and reloads itself once when it finds one. So being stuck on an old
version should stop happening.

---

## Forcing the newest version (iPhone)

Normally unnecessary — the app updates itself. If it ever seems stuck:

1. Delete the app from the home screen.
2. Open the app link in Safari with a fresh tag, e.g. `...trip-planner/?v=17`.
3. Pull down to refresh → **Share → Add to Home Screen**.

---

## Good to remember

- **Everyday use never needs a long Claude Code build session** — those were one-time.
  Updating is: add → publish → paste into `data.js` → commit → push.
- Trips cost a few cents each, capped by the spending limit on the key behind the server.
- Friends get a **read-only** view. Letting them plan their own trips is still parked.
- **Two repos.** `trip-planner` is the app; `MUCHIEZ_COCKPIT` is everything else.
  Each needs its own commit — check the Current Repository dropdown in GitHub Desktop.

---

## Parked ideas (for later)

- Friends generating their own trips (cost vs. free-stack decision).
- A real cloud backend for instant, automatic sync (removes the copy-paste/push step).
- Sorting the 88 "Gespeicherte Orte" places by city so they can be used too.
- An in-app editor for the trusted sources list.
