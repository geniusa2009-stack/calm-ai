// Dev aid: print what the engine concludes from demo data.
process.env.CALM_DB_PATH = process.env.CALM_DB_PATH || ":memory:";
import { seedDemo } from "../lib/seed";
import { createDemoUser } from "../lib/auth";
import { patternsSnapshot } from "../lib/snapshot";
import { tagEffects, sleepLinks, weekdayPatterns } from "../lib/engine/context";
import { whatIf } from "../lib/engine/whatif";
const demo = createDemoUser();
seedDemo(demo.id, "work");
const s = patternsSnapshot(demo.id);
console.log("PULSE", s.pulse.state, s.pulse.score, s.pulse.strain, s.pulse.confidenceText, s.pulse.drivers.map(d=>d.text));
console.log("RADAR", s.radar.signals.map(x=>`${x.severity}:${x.id}`));
console.log("FX", tagEffects(s.days).map(e=>`${e.confidence} ${e.text}`));
console.log("SLEEP", sleepLinks(s.days).map(l=>l.text), "WEEKDAY", weekdayPatterns(s.days).map(w=>w.text));
console.log("RECOVERY", s.recovery.text, s.recovery.episodes);
console.log("INSIGHTS", s.insights.map(i=>i.title+" | "+i.body));
console.log("RECS", s.recommendations.slice(0,3).map(r=>r.tool.name+" "+r.score+" "+r.reason));
console.log("NUDGES", s.nudges, "PRO", s.suggestProfessional, s.hardDays14);
console.log("WHATIF", JSON.stringify(whatIf(s.days, s.sessions, { sleepDelta: 1, reduceTags: ["late-screens"], addTags: ["exercise"], dailySupport: true })));
