// Renders an inventory as Markdown.
import type { Inventory } from "./inventory.js";

const cell = (v: unknown) => String(v ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ");
const code = (v: string | null) => (v ? `\`${cell(v)}\`` : "");
const yes = (b: boolean) => (b ? "yes" : "");

function table(head: string[], rows: unknown[][]) {
  if (!rows.length) return "_None._\n";
  return [
    `| ${head.join(" | ")} |`,
    `|${head.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`),
  ].join("\n") + "\n";
}

export function toMarkdown(inv: Inventory): string {
  const authPolicies = inv.policies.filter((p) => p.authCalls.length);
  const otherPolicies = inv.policies.filter((p) => !p.authCalls.length);
  const appSchemas = inv.schemas.filter((s) => !s.managed);
  const customRoles = inv.roles.filter((r) => !r.managed);
  const authFunctions = inv.functions.filter((f) => f.authCalls.length);

  const out: string[] = [];
  out.push(`# Unvendor inventory\n`);
  out.push(`Source: ${inv.source.platform}, database \`${inv.source.database}\`, PostgreSQL ${inv.source.version}. Generated ${inv.generatedAt}.\n`);

  out.push(`## Summary\n`);
  out.push(table(["Item", "Count", "Has to move"], [
    ["App schemas", appSchemas.length, appSchemas.map((s) => s.name).join(", ")],
    ["Custom roles", customRoles.length, customRoles.map((r) => r.name).join(", ")],
    ["RLS policies using auth.*", authPolicies.length, "Rewrite onto the shim schema (M3)"],
    ["Other RLS policies", otherPolicies.length, "Copy as is"],
    ["Storage buckets", inv.buckets.length, inv.buckets.map((b) => b.id).join(", ")],
    ["App functions", inv.functions.length, `${authFunctions.length} call auth.*`],
  ]));

  out.push(`## Schemas\n`);
  out.push(table(["Schema", "Managed by platform", "Tables", "Tables with RLS"],
    inv.schemas.map((s) => [s.name, yes(s.managed), s.tables, s.rlsTables])));

  out.push(`## Roles\n`);
  out.push(table(["Role", "Managed by platform", "Login", "Superuser", "Bypasses RLS", "Member of"],
    inv.roles.map((r) => [r.name, yes(r.managed), yes(r.login), yes(r.superuser), yes(r.bypassRls), r.memberOf.join(", ")])));

  out.push(`## RLS policies using auth.*\n`);
  out.push(table(["Table", "Policy", "Command", "Roles", "auth.* calls", "USING", "WITH CHECK"],
    authPolicies.map((p) => [`${p.schema}.${p.table}`, p.name, p.command, p.roles.join(", "),
      p.authCalls.join(", "), code(p.using), code(p.withCheck)])));

  out.push(`## Other RLS policies\n`);
  out.push(table(["Table", "Policy", "Command", "Roles", "USING", "WITH CHECK"],
    otherPolicies.map((p) => [`${p.schema}.${p.table}`, p.name, p.command, p.roles.join(", "),
      code(p.using), code(p.withCheck)])));

  out.push(`## Storage buckets\n`);
  out.push(table(["Bucket", "Public", "Objects", "Bytes", "Size limit", "MIME types"],
    inv.buckets.map((b) => [b.id, yes(b.public), b.objects, b.bytes, b.fileSizeLimit ?? "", b.allowedMimeTypes?.join(", ") ?? ""])));

  out.push(`## Functions\n`);
  out.push(table(["Function", "Returns", "Language", "Security definer", "auth.* calls"],
    inv.functions.map((f) => [`${f.schema}.${f.name}(${f.args})`, f.returns, f.language, yes(f.securityDefiner), f.authCalls.join(", ")])));

  out.push(`## Not checked\n`);
  out.push([
    `- Edge Functions and secrets: need the platform's management API, not read yet.`,
    `- auth.* calls outside policies and functions (column defaults, views, triggers).`,
  ].join("\n") + "\n");

  return out.join("\n");
}
