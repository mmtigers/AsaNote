import type { Page, Route } from "@playwright/test";

// ログインしたときの画面(連絡メモなど)を、本物の Supabase を使わずに確かめるための、メモリ上の偽の Supabase(#297)。
// CI のビルドは NEXT_PUBLIC_SUPABASE_URL に placeholder を渡している(ci-yoru.yml)ので、その宛先への通信を
// page.route で横取りし、PostgREST・Auth・Edge Function の応答を返す。テストで使う機能に要る分だけを実装する。
// 本物の Claude API は呼ばない(費用と不安定さを避ける。Edge Function の応答もここで作る)。

export const SUPABASE_URL = "https://placeholder.supabase.co";
// supabase-js がセッションを置く localStorage のキー(sb-<プロジェクトの ref>-auth-token)。
const STORAGE_KEY = "sb-placeholder-auth-token";

export const USER = { id: "11111111-1111-4111-8111-111111111111", email: "parent@example.com" };

type Row = Record<string, unknown>;

export interface FakeSupabase {
  tables: Record<string, Row[]>;
  // Edge Function の呼び出し(関数名と body)。
  functionCalls: { name: string; body: Row }[];
  // REST の書き込み(PATCH / POST)の記録。
  writes: { table: string; method: string; body: unknown }[];
}

// 署名の無い JWT(supabase-js は中身を読むだけで、署名は確かめない)。
function fakeJwt(): string {
  const enc = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc({ sub: USER.id, email: USER.email, role: "authenticated", aud: "authenticated", exp })}.sig`;
}

function authUser() {
  return {
    id: USER.id,
    aud: "authenticated",
    role: "authenticated",
    email: USER.email,
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  };
}

function session() {
  return {
    access_token: fakeJwt(),
    refresh_token: "fake-refresh-token",
    token_type: "bearer",
    expires_in: 60 * 60 * 24,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    user: authUser(),
  };
}

// PostgREST の絞り込み(eq / in / is)と並べ替え・件数。テストで使う形だけ。
function applyQuery(rows: Row[], params: URLSearchParams): Row[] {
  let out = rows;
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    const [op, ...rest] = raw.split(".");
    const value = rest.join(".");
    if (op === "eq") out = out.filter((r) => String(r[key]) === value);
    else if (op === "in") {
      const list = value.replace(/^\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, ""));
      out = out.filter((r) => list.includes(String(r[key])));
    } else if (op === "is" && value === "null") out = out.filter((r) => r[key] === null || r[key] === undefined);
    else if (op === "gte") out = out.filter((r) => String(r[key]) >= value);
    else if (op === "lte") out = out.filter((r) => String(r[key]) <= value);
  }
  const order = params.get("order");
  if (order) {
    const [col, dir] = order.split(",")[0]!.split(".");
    out = [...out].sort((a, b) => (String(a[col!]) < String(b[col!]) ? -1 : 1) * (dir === "desc" ? -1 : 1));
  }
  const limit = params.get("limit");
  return limit ? out.slice(0, Number(limit)) : out;
}

// 主キー(upsert で重ねる列)。
const PRIMARY_KEY: Record<string, string> = { liaison_memo_settings: "child_id" };

export async function installFakeSupabase(
  page: Page,
  options: {
    tables?: Record<string, Row[]>;
    // Edge Function を呼ばれたときの処理(state を書き換えてよい)。返した値が応答の JSON になる。
    onFunction?: (name: string, body: Row, fake: FakeSupabase) => Row;
  } = {}
): Promise<FakeSupabase> {
  const fake: FakeSupabase = { tables: { ...options.tables }, functionCalls: [], writes: [] };
  const table = (name: string) => (fake.tables[name] ??= []);

  // ログイン済みの状態から始める(supabase-js が起動時に読むセッション)。入れるのはタブで最初の1回だけ
  // (ページを移るたびに入れ直すと、ログアウト・退会でセッションが消えたことを確かめられないため)。
  await page.addInitScript(
    ([key, value]) => {
      if (window.sessionStorage.getItem("fake-supabase-seeded")) return;
      window.sessionStorage.setItem("fake-supabase-seeded", "1");
      window.localStorage.setItem(key, value);
    },
    [STORAGE_KEY, JSON.stringify(session())] as const
  );

  await page.route(`${SUPABASE_URL}/**`, async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });

    if (method === "OPTIONS") {
      return route.fulfill({
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
          "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
        },
      });
    }

    // Auth
    if (url.pathname === "/auth/v1/user") return json(authUser());
    if (url.pathname === "/auth/v1/token") return json(session());
    if (url.pathname === "/auth/v1/logout") return route.fulfill({ status: 204 });

    // Edge Function
    const fn = /^\/functions\/v1\/([\w-]+)$/.exec(url.pathname);
    if (fn) {
      const body = (request.postDataJSON() ?? {}) as Row;
      fake.functionCalls.push({ name: fn[1]!, body });
      return json(options.onFunction ? options.onFunction(fn[1]!, body, fake) : { ok: true });
    }

    // RPC(グループの画面が呼ぶ。未所属として扱う)
    if (url.pathname.startsWith("/rest/v1/rpc/")) return json([]);

    // PostgREST
    const rest = /^\/rest\/v1\/([\w]+)$/.exec(url.pathname);
    if (rest) {
      const name = rest[1]!;
      const single = (request.headers()["accept"] ?? "").includes("vnd.pgrst.object+json");
      const respond = (rows: Row[]) => {
        if (!single) return json(rows);
        if (rows.length === 1) return json(rows[0]);
        return json({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: null, hint: null }, 406);
      };

      if (method === "GET" || method === "HEAD") return respond(applyQuery(table(name), url.searchParams));

      if (method === "POST") {
        const body = request.postDataJSON() as Row | Row[];
        fake.writes.push({ table: name, method, body });
        const key = PRIMARY_KEY[name] ?? "id";
        const saved = (Array.isArray(body) ? body : [body]).map((row) => {
          const existing = table(name).find((r) => row[key] !== undefined && r[key] === row[key]);
          if (existing) return Object.assign(existing, row);
          const created = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
          table(name).push(created);
          return created;
        });
        return respond(saved);
      }

      if (method === "PATCH") {
        const body = request.postDataJSON() as Row;
        fake.writes.push({ table: name, method, body });
        const targets = applyQuery(table(name), url.searchParams);
        for (const r of targets) Object.assign(r, body);
        return respond(targets);
      }

      if (method === "DELETE") {
        const targets = new Set(applyQuery(table(name), url.searchParams));
        fake.tables[name] = table(name).filter((r) => !targets.has(r));
        return respond([...targets]);
      }
    }

    // ストレージ(写真)などは、このテストでは使わない。
    return json({ message: "not handled in fake supabase" }, 404);
  });

  return fake;
}
