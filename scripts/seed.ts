// Creates a fresh demo account and fills it with demo data. Prints its id.
// Demo data is never written into a real account.
import { createDemoUser } from "../lib/auth";
import { seedDemo } from "../lib/seed";
const u = createDemoUser();
seedDemo(u.id, (process.argv[2] as never) || "work");
console.log(`Seeded demo account #${u.id} in`, process.env.CALM_DB_PATH || "data/calm.db");
