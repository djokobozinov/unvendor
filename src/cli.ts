#!/usr/bin/env node
// unvendor inventory [--json] [--out <file>]
import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { SupabaseAdapter } from "./adapters/supabase.js";
import { toMarkdown } from "./report.js";

const usage = `Usage: unvendor inventory [--json] [--out <file>]

Reads the source project and reports everything that has to move.
Connects to SUPABASE_DB_URL. Never writes to the source.`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { json: { type: "boolean" }, out: { type: "string" }, help: { type: "boolean", short: "h" } },
});

if (values.help || positionals[0] !== "inventory") {
  console.log(usage);
  process.exit(values.help ? 0 : 1);
}

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("SUPABASE_DB_URL is not set.");
  process.exit(1);
}

const adapter = new SupabaseAdapter(dbUrl);
try {
  const inv = await adapter.inventory();
  const report = values.json ? JSON.stringify(inv, null, 2) + "\n" : toMarkdown(inv);
  if (values.out) await writeFile(values.out, report);
  else process.stdout.write(report);
} finally {
  await adapter.close();
}
