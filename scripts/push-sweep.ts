import { runSweep } from "../lib/push/sweep";
runSweep().then((s) => { console.log(JSON.stringify(s)); }).catch((e) => { console.error("[push:sweep]", e instanceof Error ? e.message : "failed"); process.exit(1); });
