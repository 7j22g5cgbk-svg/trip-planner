/* Offline proof that a reply carrying web-search <cite> elements still parses.
 *
 * Run:  jsc tools/cite_parse_test.js -- index.html
 *
 * Regression guard for the "Could not read the trip data" failure seen on
 * "New York, 7 days": stop_reason end_turn, nothing truncated, but the model
 * had written citation elements INSIDE JSON string values and the old rule
 * stripped only the tags - leaving the quoted source text, newlines and quote
 * marks and all, sitting inside the string.
 *
 * Costs no API credit. Lifts the real cleanup + extractJsonObject out of the
 * page so it cannot drift from what ships.
 */
var path = arguments[0] || "index.html";
var src  = readFile(path);

/* The page's own scanner. */
var f = src.indexOf("  function extractJsonObject(");
if (f === -1) { print("ERROR: extractJsonObject not found"); quit(1); }
var brace = src.indexOf("\n  }", f);
eval(src.slice(f, brace + 4));

/* The page's own cite rules, read out of the file rather than restated. */
var rules = [];
var re = /raw = raw\.replace\((\/(?:[^\/\\\n]|\\.)+\/[gimsuy]*), ""\);/g, m;
while ((m = re.exec(src)) !== null) if (m[1].indexOf("cite") !== -1) rules.push(m[1]);
if (!rules.length) { print("ERROR: no cite rules found in " + path); quit(1); }
print("cite parse test  (" + path + ")");
print("  rules found: " + rules.length);
rules.forEach(function (r) { print("    " + r); });

function clean(s) {
  rules.forEach(function (r) { s = s.replace(eval(r), ""); });
  return s;
}

var fails = 0, checks = 0;
function ok(cond, what) {
  checks++;
  if (!cond) { fails++; print("  FAIL  " + what); } else print("  ok    " + what);
}
function parses(s, what) {
  var t = null;
  try { t = JSON.parse(extractJsonObject(clean(s))); } catch (e) { t = null; }
  ok(t && typeof t === "object", what);
  return t;
}

/* 1. The exact shape that failed: cite inside a string value, with a newline
      in the quoted text - illegal inside a JSON string. */
var trip = parses(
  '{"destination":"New York City","note":"<cite index="3-1">\nModern-luxe ' +
  'boutique hotel Williamsburg was\nnamed "best" by critics</cite>Great rooftop"}',
  "cite with newlines AND quotes inside a string value parses");
ok(trip && trip.note.indexOf("Modern-luxe") === -1,
   "the quoted source text is gone from the value");
ok(trip && trip.note === "Great rooftop",
   "the model's own words survive (got: " + (trip ? JSON.stringify(trip.note) : "-") + ")");

/* 2. Leading prose before the JSON, as the model often writes. */
parses("I'll research New York now.\n\nBased on the sources, here is the brief.\n\n" +
       '{"destination":"NYC","summary":"<cite index="1">quoted\nsource</cite>ok"}',
       "prose before the JSON still parses");

/* 3. An unpaired tag must not swallow the rest of the reply. */
var t3 = parses('{"a":"<cite index="2">x","b":"kept"}',
                "an unpaired cite tag does not eat the document");
ok(t3 && t3.b === "kept", "content after an unpaired tag survives");

/* 4. A reply with no cites at all must be untouched. */
var plain = '{"destination":"Lisbon","summary":"No citations here"}';
ok(clean(plain) === plain, "a reply with no cites is left byte-identical");

/* 5. Several cites across several fields. */
var t5 = parses('{"a":"<cite index="1">one\ntwo</cite>A","b":"<cite index="2">three</cite>B"}',
                "multiple cites in multiple fields parse");
ok(t5 && t5.a === "A" && t5.b === "B", "each cite removed independently, values intact");

print("\n  " + (fails ? fails + " FAILED" : "all " + checks + " passed"));
quit(fails ? 1 : 0);
