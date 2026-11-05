import { seedDemo } from "../lib/seed";
seedDemo((process.argv[2] as never) || "work");
console.log("Seeded demo data into", process.env.CALM_DB_PATH || "data/calm.db");
