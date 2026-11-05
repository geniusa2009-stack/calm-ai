// Operator tool: move data created by the old single-user version into a registered account.
// Usage: npm run claim-legacy -- you@example.com
import { claimLegacy } from "../lib/auth";
const email = process.argv[2];
if (!email) { console.error("Usage: npm run claim-legacy -- <email of a registered account>"); process.exit(1); }
try { const id = claimLegacy(email); console.log(`Legacy data moved to account #${id}.`); }
catch (e) { console.error((e as Error).message); process.exit(1); }
