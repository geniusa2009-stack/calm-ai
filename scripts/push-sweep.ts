// Cron entry point: send due reminders. Example crontab (every 15 min):
//   */15 * * * *  cd /srv/calm-ai && CALM_DB_PATH=... CALM_VAPID_PUBLIC_KEY=... CALM_VAPID_PRIVATE_KEY=... npm run push:sweep
import { runSweep } from "../lib/push/sweep";
runSweep().then((s) => { console.log(JSON.stringify(s)); }).catch((e) => { console.error("[push:sweep]", e instanceof Error ? e.message : "failed"); process.exit(1); });
