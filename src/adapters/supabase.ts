// Supabase source adapter. Reads the project's Postgres catalog over a read-only connection.
import postgres from "postgres";
import { findAuthCalls, type Inventory, type SourceAdapter } from "../inventory.js";

// Schemas and roles that Supabase creates in every project.
const MANAGED_SCHEMAS = new Set([
  "auth", "storage", "realtime", "_realtime", "extensions", "graphql", "graphql_public",
  "net", "pgbouncer", "pgsodium", "pgsodium_masks", "vault", "supabase_functions",
  "supabase_migrations", "cron", "_analytics", "information_schema",
]);

const MANAGED_ROLES = new Set([
  "anon", "authenticated", "service_role", "authenticator", "postgres", "dashboard_user",
  "pgbouncer", "pgsodium_keyholder", "pgsodium_keyiduser", "pgsodium_keymaker",
  "supabase_admin", "supabase_auth_admin", "supabase_storage_admin", "supabase_functions_admin",
  "supabase_realtime_admin", "supabase_replication_admin", "supabase_read_only_user",
  "supabase_etl_admin", "supabase_privileged_role",
]);

export class SupabaseAdapter implements SourceAdapter {
  readonly platform = "supabase";
  private sql: postgres.Sql;

  constructor(dbUrl: string) {
    this.sql = postgres(dbUrl, {
      max: 1,
      onnotice: () => {},
      connection: { application_name: "unvendor-inventory" },
    });
  }

  async inventory(): Promise<Inventory> {
    // A read-only transaction is the guard; the Supabase pooler ignores startup parameters
    // such as default_transaction_read_only.
    return this.sql.begin("read only", async (sql) => {
      const [meta] = await sql`select current_database() as db, current_setting('server_version') as version`;

      const schemas = (await sql`
        select n.nspname as name,
               count(c.oid) filter (where c.relkind in ('r', 'p'))::int as tables,
               count(c.oid) filter (where c.relkind in ('r', 'p') and c.relrowsecurity)::int as rls_tables
        from pg_namespace n
        left join pg_class c on c.relnamespace = n.oid
        where n.nspname not like 'pg\\_%'
        group by n.nspname
        order by n.nspname`).map((r) => ({
        name: r.name, managed: MANAGED_SCHEMAS.has(r.name), tables: r.tables, rlsTables: r.rls_tables,
      }));

      const roles = (await sql`
        select r.rolname as name, r.rolcanlogin as login, r.rolsuper as superuser, r.rolbypassrls as bypass_rls,
               array(select g.rolname::text from pg_auth_members m join pg_roles g on g.oid = m.roleid
                     where m.member = r.oid order by 1) as member_of
        from pg_roles r
        where r.rolname not like 'pg\\_%'
        order by r.rolname`).map((r) => ({
        name: r.name, managed: MANAGED_ROLES.has(r.name), login: r.login, superuser: r.superuser,
        bypassRls: r.bypass_rls, memberOf: r.member_of,
      }));

      const policies = (await sql`
        select schemaname, tablename, policyname, permissive, roles::text[] as roles, cmd, qual, with_check
        from pg_policies
        order by schemaname, tablename, policyname`).map((r) => ({
        schema: r.schemaname, table: r.tablename, name: r.policyname, command: r.cmd,
        permissive: r.permissive === "PERMISSIVE", roles: r.roles, using: r.qual, withCheck: r.with_check,
        authCalls: findAuthCalls(r.qual, r.with_check),
      }));

      const [{ has_storage }] = await sql`select to_regclass('storage.buckets') is not null as has_storage`;
      const buckets = !has_storage ? [] : (await sql`
        select b.id, b.name, b.public, b.file_size_limit, b.allowed_mime_types,
               count(o.id)::int as objects, coalesce(sum((o.metadata ->> 'size')::bigint), 0)::text as bytes
        from storage.buckets b
        left join storage.objects o on o.bucket_id = b.id
        group by b.id
        order by b.id`).map((r) => ({
        id: r.id, name: r.name, public: r.public,
        fileSizeLimit: r.file_size_limit === null ? null : Number(r.file_size_limit),
        allowedMimeTypes: r.allowed_mime_types, objects: r.objects, bytes: Number(r.bytes),
      }));

      const appSchemas = schemas.filter((s) => !s.managed).map((s) => s.name);
      const functions = (await sql`
        select n.nspname as schema, p.proname as name,
               pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as returns,
               l.lanname as language, p.prosecdef as security_definer, p.prosrc as source
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        join pg_language l on l.oid = p.prolang
        where n.nspname = any(${appSchemas})
          and p.prokind in ('f', 'p')
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
        order by 1, 2`).map((r) => ({
        schema: r.schema, name: r.name, args: r.args, returns: r.returns, language: r.language,
        securityDefiner: r.security_definer, authCalls: findAuthCalls(r.source),
      }));

      return {
        source: { platform: this.platform, database: meta.db, version: meta.version },
        generatedAt: new Date().toISOString(),
        schemas, roles, policies, buckets, functions,
      };
    });
  }

  async close() {
    await this.sql.end();
  }
}
