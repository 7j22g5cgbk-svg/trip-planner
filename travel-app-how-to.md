# Travel App — How To

A short reference for updating and using your travel app. Keep this somewhere handy.

---

## Your links

- **Your app (plan trips):** https://7j22g5cgbk-svg.github.io/trip-planner/
- **Friends' page (read-only picks):** https://7j22g5cgbk-svg.github.io/trip-planner/shared/
- **Your backup file (published library):** https://7j22g5cgbk-svg.github.io/trip-planner/shared/data.js

Send friends the **Friends' page** link.

---

## Everyday routine: add or change a place

Do this whenever you add, edit, or remove places you want kept and shared.

1. In the app: **My Library → Add** (or edit/delete). Fill in the **City** — it must match what you'd type when planning (e.g. `Lisbon`, not `Lisboa`).
2. **My Library → Backup → Publish for friends → Copy.**
3. Put that text into your `data.js` file — pick one:
   - **Ask Claude Code (easiest):** paste this one line —
     `Replace the contents of ~/Desktop/trip-planner/shared/data.js with what's on my clipboard (pbpaste), then confirm it starts with window.SHARED_LIBRARY.`
   - **By hand:** open `~/Desktop/trip-planner/shared/data.js`, select all, paste, save.
4. **GitHub Desktop** → type any short message → **Commit to main** → **Push origin**.
5. Wait ~1 minute. Friends refresh their page to see the update.

**Golden rule:** Publish + push after meaningful changes. Publishing is both *sharing with friends* and *your backup* — so this is also what protects your library from being lost.

---

## If your library ever disappears (after reinstalling the app)

It restores itself. Just open the app — it reloads your library from the published `data.js`.
It comes back as fresh as your **last publish**, which is why the routine above matters.

If it doesn't auto-restore: **My Library → Backup → Import**, paste the contents of your
`data.js` (the part inside the outer `{ }`), tap **Load**.

---

## Reinstalling / forcing the newest version

The installed app can cache an old version. To force the latest:
1. Delete the app from the home screen.
2. Open the app link in Safari **with a fresh tag** on the end, e.g. `...trip-planner/?v=15`
   (just change the number each time).
3. Pull down to refresh, then **Share → Add to Home Screen**.

---

## Good to remember

- **Everyday use never needs the long Claude Code tickets** — those were one-time building.
  Updating is just: Add → Publish → (paste into data.js) → Commit → Push.
- Planning a trip on your phone uses your **Anthropic API key** (a few cents per trip),
  capped by the spending limit you set in the console.
- Your **Mac** travel tool is separate and free (runs on your Claude subscription).
- Friends currently get a **read-only** view of your picks. Letting them plan their own
  trips is a future decision (your key ≈ $12 for the two of them, or the free
  Firecrawl + Gemini build) — parked for now.

---

## Parked ideas (for later)

- Friends generating their own trips (cost vs. free-stack decision).
- An "unpublished changes" reminder in the app.
- A real cloud backend (Stage 5b) if the copy-paste update ever gets annoying.
