export interface Inventory {
  source: { platform: string; database: string; version: string };
  generatedAt: string;
  schemas: Schema[];
  roles: Role[];
  policies: Policy[];
  buckets: Bucket[];
  functions: DbFunction[];
}

export interface Schema {
  name: string;
  managed: boolean;
  tables: number;
  rlsTables: number;
}

export interface Role {
  name: string;
  managed: boolean;
  login: boolean;
  superuser: boolean;
  bypassRls: boolean;
  memberOf: string[];
}

export interface Policy {
  schema: string;
  table: string;
  name: string;
  command: string;
  permissive: boolean;
  roles: string[];
  using: string | null;
  withCheck: string | null;
  authCalls: string[];
}

export interface Bucket {
  id: string;
  name: string;
  public: boolean;
  fileSizeLimit: number | null;
  allowedMimeTypes: string[] | null;
  objects: number;
  bytes: number;
}

export interface DbFunction {
  schema: string;
  name: string;
  args: string;
  returns: string;
  language: string;
  securityDefiner: boolean;
  authCalls: string[];
}

export interface SourceAdapter {
  readonly platform: string;
  inventory(): Promise<Inventory>;
  close(): Promise<void>;
}

const AUTH_CALL = /\bauth\s*\.\s*(uid|jwt|role|email)\s*\(\s*\)/gi;

export function findAuthCalls(...sql: (string | null | undefined)[]): string[] {
  const found = new Set<string>();
  for (const s of sql) for (const m of s?.matchAll(AUTH_CALL) ?? []) found.add(`auth.${m[1].toLowerCase()}()`);
  return [...found].sort();
}
