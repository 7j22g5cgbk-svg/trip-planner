/* Proves the truncation retry can never stack two long requests.
 *
 * Run:  jsc tools/retry_budget_test.js -- index.html
 *
 * Like trip_test.py, this reads the numbers out of index.html rather than
 * restating them, so it fails if the page's budget changes underneath it.
 * It costs no backend trips, so it can run on every edit.
 */
var args = arguments;                     /* jsc: args after "--" */
var path = args[0] || "index.html";
var src  = readFile(path);

function num(name) {
  var m = new RegExp("var\\s+" + name + "\\s*=\\s*(\\d+)").exec(src);
  if (!m) throw new Error("index.html no longer defines " + name);
  return parseInt(m[1], 10);
}

var REQUEST_TIMEOUT_MS = num("REQUEST_TIMEOUT_MS");
var PLAN_BUDGET_MS     = num("PLAN_BUDGET_MS");
var RETRY_MIN_MS       = num("RETRY_MIN_MS");
var CLOUDFLARE_CUT_MS  = 125000;          /* what a 524 comes from */

/* The page's own two expressions, mirrored. */
function watchdogFor(deadline, now) {
  var left = deadline ? deadline - now : REQUEST_TIMEOUT_MS;
  return Math.max(1000, Math.min(REQUEST_TIMEOUT_MS, left));
}
function retries(deadline, now) {
  return (deadline ? deadline - now : PLAN_BUDGET_MS) >= RETRY_MIN_MS;
}

var fails = 0;
function check(ok, what) {
  if (!ok) { fails++; print("  FAIL  " + what); }
  else print("  ok    " + what);
}

print("retry budget test  (" + path + ")");
print("  REQUEST_TIMEOUT_MS " + REQUEST_TIMEOUT_MS +
      "   PLAN_BUDGET_MS " + PLAN_BUDGET_MS +
      "   RETRY_MIN_MS " + RETRY_MIN_MS + "\n");

/* 1. A single attempt must abort before Cloudflare does. */
check(REQUEST_TIMEOUT_MS < CLOUDFLARE_CUT_MS,
      "one attempt (" + REQUEST_TIMEOUT_MS / 1000 + "s) aborts before the " +
      CLOUDFLARE_CUT_MS / 1000 + "s cut");

/* 2. Sweep every instant the first attempt could truncate at, and assert the
      worst-case total wall time never exceeds the budget. This is the
      stacking bug: before the deadline was shared, t + REQUEST_TIMEOUT_MS
      could reach 190s+ here. */
var worst = 0, worstAt = 0;
for (var t = 0; t <= PLAN_BUDGET_MS; t += 250) {
  var start    = 0;
  var deadline = start + PLAN_BUDGET_MS;
  var total    = t;                        /* first attempt took t */
  if (retries(deadline, t)) total = t + watchdogFor(deadline, t);
  if (total > worst) { worst = total; worstAt = t; }
}
check(worst <= PLAN_BUDGET_MS,
      "worst-case total across both attempts is " + worst / 1000 +
      "s (first attempt truncating at " + worstAt / 1000 + "s), budget " +
      PLAN_BUDGET_MS / 1000 + "s");

/* 3. A first attempt that was already slow must not trigger a second wait. */
var slow = PLAN_BUDGET_MS - RETRY_MIN_MS + 1000;
check(!retries(PLAN_BUDGET_MS, slow),
      "no retry after a slow first attempt (" + slow / 1000 + "s)");

/* 4. A fast truncation must still get its retry - the safety net stays. */
check(retries(PLAN_BUDGET_MS, 25000),
      "retry still happens after a fast truncation (25s)");

/* 5. A fresh attempt gets the full per-attempt watchdog. */
check(watchdogFor(PLAN_BUDGET_MS, 0) === REQUEST_TIMEOUT_MS,
      "first attempt gets the full " + REQUEST_TIMEOUT_MS / 1000 + "s watchdog");

/* 6. The watchdog is never zero or negative, even past the deadline. */
check(watchdogFor(PLAN_BUDGET_MS, PLAN_BUDGET_MS + 5000) > 0,
      "watchdog stays positive even past the deadline");

print("\n  " + (fails ? fails + " FAILED" : "all passed"));
