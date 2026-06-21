#!/usr/bin/env node
// Unit test for the WC fantasy-desk event-signature dedup.
import { detectKind, eventSig, matchWc, wcIndex } from "./wc-fantasy-topics.mjs";

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name); } };

const idx = wcIndex();
const sig = (title, kind) => eventSig(kind ?? detectKind(title), matchWc(title, idx));

console.log("detectKind:");
ok("score → result", detectKind("Tunisia 0-4 Japan at the 2026 FIFA World Cup: match report") === "result");
ok("injury keyword → injury", detectKind("Brazil confirm Raphinha hamstring injury, World Cup return in doubt") === "injury");
ok("transfer keyword → transfer", detectKind("Fabrizio Romano: Liverpool agree deal to sign Raphinha after World Cup") === "transfer");
ok("plain feature", detectKind("Raphinha of Brazil at the 2026 FIFA World Cup: form and fantasy outlook") === "feature");

console.log("event-signature collapse (the near-dup bug):");
const r1 = sig("Brazil confirm Raphinha hamstring injury, World Cup return in doubt", "injury");
const r2 = sig("Raphinha injury uncertainty: distress over the Brazilian star", "injury");
ok("two Raphinha injury headlines → same sig", r1 === r2 && /raphinha/.test(r1));
console.log("    sig =", r1);

console.log("distinctness (must NOT over-suppress):");
const j1 = sig("Tunisia 0-4 Japan at the 2026 FIFA World Cup: match report");
const j2 = sig("Japan 2-1 Spain at the 2026 FIFA World Cup: match report");
ok("two different Japan results → different sigs", j1 !== j2);
ok("injury vs feature about same player → different sigs",
  sig("Raphinha injury doubt for Brazil", "injury") !== sig("Raphinha of Brazil: form and fantasy outlook", "feature"));

console.log("subject precedence (player named ⇒ player is the subject):");
ok("nation in one headline but not other still collapses on surname",
  sig("Raphinha ruled out", "injury") === sig("Brazil sweat on Raphinha fitness", "injury"));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
