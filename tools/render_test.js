/* Offline proof that the app still produces map links after the model stopped
   sending them. Lifts the real link helpers out of the page (no network, no
   API credit) and runs them over trips that carry NO maps/route_maps field -
   exactly what the new prompt asks the model for.
   Usage: jsc render_test.js -- <index.html> */
var src = readFile(arguments[0]);

/* helpers esc/txt/arr/url/plus/query/destQ/mapsFor/routeFor sit in one run */
var from = src.indexOf("  function esc(");
var to   = src.indexOf("  /* href is already escaped");
if (from === -1 || to === -1) { print("ERROR: helper block not found"); quit(1); }
eval(src.slice(from, to));

var fails = 0, checks = 0;
function ok(cond, what) {
  checks++;
  if (!cond) { fails++; print("  FAIL: " + what); }
}

destQ = plus("Lisbon");

/* A trip shaped exactly like the new schema: no maps, no route_maps. */
var stops = [
  { time: "09:00", name: "Jeronimos Monastery", note: "go early", website: "" },
  { time: "13:00", name: "Cervejaria Ramiro",  note: "seafood",  website: "https://ramiro.pt" },
  { time: "18:00", name: "Miradouro da Senhora do Monte", note: "sunset", website: "" }
];
var day = { day: 1, stops: stops };

stops.forEach(function (s) {
  var m = mapsFor(s);
  ok(m.indexOf("google.com/maps/search/") !== -1, "stop '" + s.name + "' got a map link");
  ok(m.indexOf(plus("Lisbon")) !== -1,            "stop '" + s.name + "' link carries the city");
});

var r = routeFor(day);
ok(r.indexOf("google.com/maps/dir/") !== -1, "day route link built");
ok(r.indexOf("waypoints=") !== -1,           "day route carries waypoints");
ok(r.indexOf(plus("Miradouro da Senhora do Monte")) !== -1, "route ends at the last stop");

/* Items with no maps field at all, of every kind the page renders. */
[{ name: "Bairro Alto Hotel" }, { name: "Belcanto" }, { name: "Torre de Belem" }]
  .forEach(function (it) {
    ok(mapsFor(it).indexOf("google.com/maps/search/") !== -1,
       "'" + it.name + "' got a map link with no maps field");
  });

/* A model that DOES still send maps must keep working (older cached replies). */
ok(mapsFor({ name: "X", maps: "https://maps.example/x" }) === "https://maps.example/x",
   "an explicit maps URL is still honoured");
/* ...and a junk one must fall back, not render a broken link. */
ok(mapsFor({ name: "Belcanto", maps: "not a url" }).indexOf("google.com/maps") !== -1,
   "a junk maps value falls back to a built link");
/* A day with no stops must not produce a route link. */
ok(routeFor({ day: 1, stops: [] }) === "", "empty day yields no route link");

print((fails ? "FAIL" : "PASS") + ": " + (checks - fails) + "/" + checks +
      " render checks passed");
quit(fails ? 1 : 0);
