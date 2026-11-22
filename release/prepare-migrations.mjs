import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Assemble the migration history for a clean self-hosted database without connecting to it.
const supabase = "supabase/migrations";
const drizzle = "drizzle/migrations";
const replacements = "release/replacements";
const { entries } = JSON.parse(readFileSync(join(drizzle, "meta/_journal.json"), "utf8"));

const legacy = entries.map(({ tag, when }) => {
  if (!/^\d{4}_[a-z_]+$/.test(tag) || !Number.isSafeInteger(when)) {
    throw new Error("Unexpected Drizzle migration entry");
  }
  const version = new Date(when).toISOString().slice(0, 19).replace(/\D/g, "");
  return { source: join(drizzle, `${tag}.sql`), name: `${version}_legacy_${tag}.sql` };
});
const replacementsByName = readdirSync(replacements).filter((name) => /^\d{14}_[a-z_]+\.sql$/.test(name));
const copies = [...legacy, ...replacementsByName.map((name) => ({ source: join(replacements, name), name }))];
const existingVersions = new Map(readdirSync(supabase).map((name) => [name.split("_")[0], name]));

for (const { source, name } of copies) {
  const version = name.split("_")[0];
  const existing = existingVersions.get(version);
  const destination = join(supabase, name);
  if (existing && existing !== name) throw new Error(`Conflicting migration version ${version}`);
  const sql = readFileSync(source);
  if (existsSync(destination)) {
    if (!readFileSync(destination).equals(sql)) throw new Error(`Migration differs from its source: ${name}`);
  } else {
    writeFileSync(destination, sql, { flag: "wx" });
  }
  existingVersions.set(version, name);
}
console.log(`Prepared ${copies.length} migration files for a clean self-hosted database.`);
