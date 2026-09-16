/* Extracts the app's real prompt for a destination, so the test suite can
   never drift from index.html. Reads index.html, pulls out buildPrompt()
   verbatim, and runs it with the two optional blocks supplied by this file.

   Usage:
     jsc extract_prompt.js -- <index.html> <destination> [saved] [likes] [dislikes]

   saved/likes/dislikes default to 0 - a fresh device with an empty library.
   Pass counts to simulate a loaded device: index.html caps these at
   SAVED_MAX = 60 saved places and PREF_MAX = 15 likes + 15 dislikes, and
   those blocks are appended to every prompt the real app sends. */
var args = arguments;
var src = readFile(args[0]);
var dest     = args[1];
var nSaved   = parseInt(args[2] || "0", 10);
var nLikes   = parseInt(args[3] || "0", 10);
var nDislike = parseInt(args[4] || "0", 10);

var start = src.indexOf("function buildPrompt(");
if (start === -1) { print("ERROR: buildPrompt not found in " + args[0]); quit(1); }

var depth = 0, end = -1, started = false;
for (var i = start; i < src.length; i++) {
  var c = src.charAt(i);
  if (c === "{") { depth++; started = true; }
  else if (c === "}") { depth--; if (started && depth === 0) { end = i + 1; break; } }
}
if (end === -1) { print("ERROR: could not find end of buildPrompt"); quit(1); }
var fnSrc = src.slice(start, end);

/* Typical saved-place wording, reused to fill a library to the cap. */
var NAMES = ["Belcanto","Time Out Market","Cervejaria Ramiro","A Cevicheria","Pasteis de Belem",
  "Bairro do Avillez","Prado","Taberna da Rua das Flores","Landeau Chocolate","Manteigaria",
  "Miradouro da Senhora do Monte","LX Factory","Feira da Ladra","Museu Calouste Gulbenkian",
  "Torre de Belem","Jeronimos Monastery","Castelo de Sao Jorge","Alfama","Principe Real",
  "Embaixada","Park Bar","Topo Chiado","Pensao Amor","Cais do Sodre","Santa Justa Lift"];
var NOTES = ["loved the tasting menu","go early, queues by noon","best view at sunset",
  "book two weeks ahead","skip the tourist floor","worth the detour","quiet on weekday mornings",
  "ask for a terrace table",""];

function pick(list, i) { return list[i % list.length]; }
function label(i) { return pick(NAMES, i) + (i > 8 ? " " + (Math.floor(i / NAMES.length) + 1) : ""); }

function savedPlacesBlock() {
  if (!nSaved) return "";
  var out = [];
  for (var i = 0; i < nSaved; i++) {
    var note = pick(NOTES, i);
    out.push(note ? label(i) + " (" + note + ")" : label(i));
  }
  return " MY OWN SAVED PLACES for this destination, taken from my Google Maps "
       + "lists — I chose every one of these myself. Feature the ones that "
       + "genuinely fit this trip, keep my wording where I left a note, and set "
       + "saved=true on those. Do not feel obliged to use them all, and never "
       + "invent a detail about one: " + out.join("; ") + ".";
}

function preferencesBlock() {
  if (!nLikes && !nDislike) return "";
  var dis = [], lik = [];
  for (var i = 0; i < nDislike; i++) dis.push(label(i + 40) + " (Lisbon)");
  for (var j = 0; j < nLikes; j++)   lik.push(label(j + 70) + " (Lisbon)");
  var block = " PREFERENCES from this traveller's own saved feedback:";
  if (dis.length) block += " Do NOT recommend these places the user disliked: " + dis.join("; ") + ".";
  if (lik.length) block += " The user likes these — favor similar style and quality: " + lik.join("; ") + ".";
  return block;
}

eval(fnSrc);
print(JSON.stringify(buildPrompt(dest)));
