/* Offline proof that a runaway web_search reply fails honestly and never
 * retries.
 *
 * Run:  jsc tools/pause_turn_test.js -- index.html
 *
 * Regression guard for the failure measured on "New York, 7 days" with a full
 * library on 2026-09-17: 4 of 7 live runs came back with 13-19 server_tool_use
 * blocks against max_uses 2, stop_reason "pause_turn", ~240,000 input tokens
 * spent for ~1,000 output tokens and no JSON at all. It used to surface as
 * "Could not read the trip data" - the cite parse bug's message - and the
 * truncation path could retry it, paying for the loop twice.
 *
 * Costs no API credit. Lifts the real detector out of the page so it cannot
 * drift from what ships.
 */
var path = arguments[0] || "index.html";
var src  = readFile(path);

var fails = 0, checks = 0;
function ok(cond, what) {
  checks++;
  if (!cond) { fails++; print("  FAIL  " + what); } else print("  ok    " + what);
}

print("pause_turn / runaway search test  (" + path + ")");

/* ---- the page's own counting + detection block, read out of the file ---- */
/* jsc here ignores the argument to quit() - every run exits 0 - so a missing
   detector is reported as a failed check and printed in the summary like any
   other, rather than as an exit code nobody sees. */
var from = src.indexOf("      var parts = [];");
var to   = src.indexOf("      function searchRanLong(");
var BLOCK = (from !== -1 && to !== -1) ? src.slice(from, to) : "";
var lifted = BLOCK.indexOf("searchRanAway") !== -1;
ok(lifted, "the runaway detector is present in the page");

function analyze(content, maxUsesSent) {
  var data = { content: content };
  var body = { tools: [{ max_uses: maxUsesSent }] };
  var parts, searchCalls, searchErrors, raw, maxUses, searchRanAway;
  eval(BLOCK);
  return { calls: searchCalls, errors: searchErrors, ranAway: searchRanAway, raw: raw };
}

function search(n) {
  var out = [];
  for (var i = 0; i < n; i++) out.push({ type: "server_tool_use", name: "web_search" });
  return out;
}
var goodTrip = {
  type: "text",
  text: '{"destination":"NYC","summary":"ok","hotels":[],"itineraries":[],' +
        '"restaurants":[],"sights":[]}'
};

if (!lifted) {
  print("  (skipping the behavioural checks - nothing to lift)");
} else {

/* 1. The shape that failed live: 14 searches against max_uses 2. */
var r1 = analyze(search(14).concat([{ type: "text", text: "Let me wait and try again." }]), 2);
ok(r1.calls === 14, "counts every server_tool_use block (got " + r1.calls + ")");
ok(r1.ranAway === true, "14 searches against max_uses 2 reads as runaway");

/* 2. A healthy reply must not trip it - this is the common case. */
var r2 = analyze(search(2).concat([goodTrip]), 2);
ok(r2.calls === 2, "a normal reply makes exactly max_uses searches");
ok(!r2.ranAway, "a reply inside max_uses is NOT flagged");

/* 3. One search, one day trip: still fine. */
ok(!analyze(search(1).concat([goodTrip]), 2).ranAway, "fewer searches than allowed is fine");

/* 4. A tool error mid-turn is runaway even when the count stays legal. */
var r4 = analyze([
  { type: "server_tool_use", name: "web_search" },
  { type: "web_search_tool_result",
    content: { type: "web_search_tool_result_error", error_code: "unavailable" } },
  { type: "text", text: "The search tool appears temporarily unavailable." }
], 2);
ok(r4.errors === 1, "counts a web_search_tool_result_error block");
ok(r4.ranAway === true, "a mid-turn search error reads as runaway on its own");

/* 5. A successful search result block must not count as an error. */
var r5 = analyze([
  { type: "server_tool_use", name: "web_search" },
  { type: "web_search_tool_result", content: [{ type: "web_search_result", title: "x" }] },
  goodTrip
], 2);
ok(r5.errors === 0, "a normal (array) search result is not an error");
ok(!r5.ranAway, "a reply with working searches is not flagged");

/* 6. Text blocks still concatenate - the parse path is unchanged. */
ok(analyze(search(3).concat([{ type: "text", text: "hello" }]), 2).raw === "hello",
   "text blocks still reach raw with tool blocks ignored");

}

/* ---- the guards themselves, so they cannot be quietly deleted ---- */

/* 7. pause_turn is decided before any parsing. */
var pausePos = src.indexOf('if (data.stop_reason === "pause_turn") { searchRanLong(');
var parsePos = src.indexOf("var candidate = extractJsonObject(");
ok(pausePos !== -1, "pause_turn is handled explicitly");
ok(pausePos !== -1 && parsePos !== -1 && pausePos < parsePos,
   "pause_turn is decided before the JSON parse is attempted");

/* 8. It must not fall through to the cite bug's message. */
var citeMsgPos = src.indexOf('fail("Could not read the trip data"');
ok(pausePos !== -1 && citeMsgPos !== -1 && pausePos < citeMsgPos,
   "pause_turn returns before \"Could not read the trip data\" can fire");

/* 9. No retry: the runaway guard sits before the retry call in tooLong(). */
var tl      = src.indexOf("      function tooLong(");
var tlEnd   = src.indexOf("\n      }", tl);
var tlBody  = src.slice(tl, tlEnd);
var guardAt = tlBody.indexOf("if (searchRanAway) { searchRanLong(");
var sendAt  = tlBody.indexOf("send(dest, key, true, deadline)");
ok(guardAt !== -1, "tooLong() has a runaway guard");
ok(guardAt !== -1 && sendAt !== -1 && guardAt < sendAt,
   "the runaway guard returns before tooLong() can retry");

/* 10. send() is only ever called once more from tooLong - no other retry. */
var sends = src.match(/send\(dest, key, true, deadline\)/g) || [];
ok(sends.length === 1, "exactly one retry call site exists (got " + sends.length + ")");

/* 11. Both no-text branches are covered too. */
var emptyGuard = src.indexOf('if (searchRanAway) { searchRanLong(r.text); return; }\n        fail("Empty answer"');
ok(emptyGuard !== -1, "the empty-answer branch checks for runaway first");
var parseGuard = src.indexOf('if (searchRanAway) { searchRanLong(raw); return; }\n        fail("Could not read the trip data"');
ok(parseGuard !== -1, "the parse-failure branch checks for runaway first");

print("\n  " + (fails ? fails + " FAILED" : "all " + checks + " passed"));
quit(fails ? 1 : 0);
