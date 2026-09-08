// trip-backend — trip planning + combined thumbs totals.
// Keeps your API key secret, checks a shared password, caps trip requests per day.
//
// REFERENCE COPY of the Cloudflare Worker deployed at
// https://trip-backend.fhy5byhvk9.workers.dev
// The live version is edited in the Cloudflare dashboard
// (Workers & Pages -> trip-backend -> Edit code). Keep this file in step with
// it, so a future change can be diffed instead of guessed at.

const DAILY_LIMIT = 40; // max trip-planning requests per day for everyone. Change anytime.
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-trip-password",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Browser pre-check.
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // Owner totals page — open this in a browser.
    if (request.method === "GET" && path === "/totals") {
      return new Response(TOTALS_PAGE, {
        headers: { ...CORS, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // Data behind the totals page (needs the password).
    if (request.method === "GET" && path === "/totals-data") {
      if ((request.headers.get("x-trip-password") || "") !== env.FRIENDS_PASSWORD) {
        return json({ error: "Wrong or missing password." }, 401);
      }
      const list = await env.TRIP_KV.list({ prefix: "vote:" });
      const items = [];
      for (const k of list.keys) {
        try {
          const rec = JSON.parse((await env.TRIP_KV.get(k.name)) || "{}");
          const up = rec.up || 0, down = rec.down || 0;
          if (up + down > 0) items.push({ name: rec.name || "", city: rec.city || "", type: rec.type || "", up: up, down: down });
        } catch (e) {}
      }
      items.sort((a, b) => (b.up + b.down) - (a.up + a.down));
      return json({ items: items }, 200);
    }

    // Health check.
    if (request.method === "GET") {
      return new Response("trip-backend is alive", {
        headers: { ...CORS, "Content-Type": "text/plain" },
      });
    }

    if (request.method !== "POST") {
      return json({ error: "Use POST." }, 405);
    }

    // All POSTs need the shared password.
    if ((request.headers.get("x-trip-password") || "") !== env.FRIENDS_PASSWORD) {
      return json({ error: "Wrong or missing password." }, 401);
    }

    // Record a thumbs vote. Does NOT touch the daily trip cap.
    if (path === "/vote") {
      let b = {};
      try { b = await request.json(); } catch (e) {}
      const id = String(b.id || "").slice(0, 300);
      if (!id) return json({ error: "no id" }, 400);
      const key = "vote:" + id;
      let rec = { up: 0, down: 0, name: "", city: "", type: "" };
      try {
        const existing = await env.TRIP_KV.get(key);
        if (existing) rec = Object.assign(rec, JSON.parse(existing));
      } catch (e) {}
      // undo the friend's previous vote, if any
      if (b.prev === "up" && rec.up > 0) rec.up--;
      if (b.prev === "down" && rec.down > 0) rec.down--;
      // apply the new vote ("none" means they cleared it)
      if (b.vote === "up") rec.up++;
      if (b.vote === "down") rec.down++;
      if (b.name) rec.name = String(b.name).slice(0, 140);
      if (b.city) rec.city = String(b.city).slice(0, 140);
      if (b.type) rec.type = String(b.type).slice(0, 60);
      await env.TRIP_KV.put(key, JSON.stringify(rec));
      return json({ ok: true }, 200);
    }

    // Default POST = a trip-planning request → forward to Anthropic (with the daily cap).
    const today = new Date().toISOString().slice(0, 10);
    const ckey = `count:${today}`;
    const used = parseInt((await env.TRIP_KV.get(ckey)) || "0", 10);
    if (used >= DAILY_LIMIT) {
      return json({ error: "Daily limit reached. Try again tomorrow." }, 429);
    }
    await env.TRIP_KV.put(ckey, String(used + 1), { expirationTtl: 172800 });

    // Note: body and response are both piped straight through, never buffered.
    // That is what lets the page ask for "stream": true and keep the
    // connection alive past Cloudflare's ~100s idle limit (the old HTTP 524).
    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: request.body,
    });

    const headers = new Headers(CORS);
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "application/json");
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const TOTALS_PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Trip Planner — Thumbs Totals</title>
<style>
  body{font-family:-apple-system,system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;color:#2b2b2b}
  h1{font-size:22px}
  input{padding:10px;font-size:16px;border:1px solid #ccc;border-radius:8px;width:200px}
  button{padding:10px 16px;font-size:16px;border:0;border-radius:8px;background:#6b4f3a;color:#fff}
  table{width:100%;border-collapse:collapse;margin-top:20px}
  th,td{text-align:left;padding:8px;border-bottom:1px solid #eee;font-size:15px}
  td.n{text-align:right;font-variant-numeric:tabular-nums}
  .up{color:#237a3a;font-weight:600}
  .down{color:#a23a2f;font-weight:600}
  .msg{margin-top:12px;color:#a23a2f}
  .muted{color:#888}
</style></head><body>
<h1>Thumbs totals</h1>
<p class="muted">Combined across everyone. Enter the shared password to load.</p>
<div>
  <input id="pw" type="password" placeholder="password" autocomplete="off">
  <button onclick="load()">Load</button>
</div>
<p id="msg" class="msg"></p>
<table id="tbl" hidden><thead><tr><th>Place</th><th>City</th><th class="n">👍</th><th class="n">👎</th></tr></thead><tbody id="rows"></tbody></table>
<script>
function esc(s){return String(s||"").replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
function load(){
  var pw=document.getElementById("pw").value;
  var msg=document.getElementById("msg"); msg.textContent="Loading…";
  fetch("/totals-data",{headers:{"x-trip-password":pw}}).then(function(r){return r.json().then(function(d){return {ok:r.ok,d:d};});}).then(function(x){
    if(!x.ok){ msg.textContent=(x.d&&x.d.error)||"Could not load."; return; }
    var items=(x.d&&x.d.items)||[];
    if(!items.length){ msg.textContent="No votes recorded yet."; document.getElementById("tbl").hidden=true; return; }
    msg.textContent="";
    var rows=items.map(function(it){
      return "<tr><td>"+esc(it.name)+"</td><td>"+esc(it.city)+"</td>"+
             "<td class='n up'>"+(it.up||0)+"</td><td class='n down'>"+(it.down||0)+"</td></tr>";
    }).join("");
    document.getElementById("rows").innerHTML=rows;
    document.getElementById("tbl").hidden=false;
  }).catch(function(){ msg.textContent="Network error."; });
}
</script>
</body></html>`;
