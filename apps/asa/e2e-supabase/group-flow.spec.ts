import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { authStorageKey, type E2EConfig } from "./config";
import { loadE2EConfigFromProcess } from "./env";

// 実Supabase(テスト専用プロジェクト)でのグループ作成 → 招待コード発行 → 別ユーザーで参加 → 脱退(#117)。
// 認証経路(ログイン済みセッションでの操作)と RLS(他人・未ログインから見えない/書けない)の検証を含む。
//
// - E2E_* が揃っていなければ全体を skip する(CI の fork PR など Secrets が無い環境で赤くならない)。
// - 接続先が本番と一致するなど危険なら、loadE2EConfigFromProcess が例外を投げて中止する(skip ではなく失敗)。
// - 準備手順・後始末は apps/asa/docs/e2e-supabase.md。
//
// 実Supabaseには接続できない環境で書いたため、このファイルのロケータとRLSの期待値は、
// 実プロジェクトでの初回実行で調整が要る可能性がある(PR本文に明記)。

const loaded = loadE2EConfigFromProcess();

test.describe.configure({ mode: "serial" });

test.describe("実Supabase: グループの作成・招待・参加・脱退", () => {
  test.skip(!loaded.enabled, "E2E_SUPABASE_* が未設定のため skip(apps/asa/docs/e2e-supabase.md 参照)");

  // skip 時は beforeAll も走らない。型のために config を取り出す。
  const config = loaded.enabled ? loaded.config : (undefined as unknown as E2EConfig);

  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let sessionA: Session;
  let sessionB: Session;
  let userIdA: string;
  let userIdB: string;

  /** セッションを保存しない素のクライアントでログインする(ブラウザのセッションとは独立)。 */
  async function signIn(email: string, password: string) {
    const client = createClient(config.supabaseUrl, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      throw new Error(
        `テストユーザー ${email} でログインできません(${error?.message ?? "no session"})。` +
          "docs/e2e-supabase.md の「テストユーザーの作成」を確認してください(メール確認済み・パスワード設定済みであること)。",
      );
    }
    return { client, session: data.session };
  }

  /** 自分の所属を外す。RLS上は自分の行だけ消せる。所属が無くても何もしない(冪等な後始末)。 */
  async function leaveIfMember(client: SupabaseClient, userId: string) {
    await client.from("group_members").delete().eq("user_id", userId);
  }

  /** ログイン済み(localStorage にセッションを入れた)状態で /group を開く別コンテキストのページ。 */
  async function openGroupPageAs(browser: Browser, session: Session): Promise<Page> {
    const context = await browser.newContext();
    const key = authStorageKey(config.supabaseUrl);
    await context.addInitScript(
      ([k, value]) => {
        window.localStorage.setItem(k, value);
      },
      [key, JSON.stringify(session)] as const,
    );
    const page = await context.newPage();
    await page.goto("/group");
    return page;
  }

  test.beforeAll(async () => {
    const a = await signIn(config.userA.email, config.userA.password);
    const b = await signIn(config.userB.email, config.userB.password);
    clientA = a.client;
    clientB = b.client;
    sessionA = a.session;
    sessionB = b.session;
    userIdA = a.session.user.id;
    userIdB = b.session.user.id;
    // 前回の実行が途中で落ちて所属が残っていても、毎回まっさらな状態から始める。
    await leaveIfMember(clientA, userIdA);
    await leaveIfMember(clientB, userIdB);
  });

  test.afterAll(async () => {
    // 後始末: 途中で失敗しても、テストユーザーを必ずグループから外す。
    // 全員が抜けた空グループ(とその招待コード)は、cleanup_empty_groups_and_invites() で消す(docs/e2e-supabase.md)。
    if (clientA) await leaveIfMember(clientA, userIdA);
    if (clientB) await leaveIfMember(clientB, userIdB);
  });

  test("未ログインでは、グループ関連のデータの閲覧・作成ができない(RLS・認証経路)", async () => {
    const anon = createClient(config.supabaseUrl, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // RLSで弾かれると、エラーではなく空配列が返る(ポリシーが authenticated 限定のため)。
    for (const table of ["groups", "group_members", "group_invites"] as const) {
      const { data, error } = await anon.from(table).select("*");
      expect(error, `${table} の未ログインSELECT`).toBeNull();
      expect(data, `${table} の未ログインSELECT`).toEqual([]);
    }

    const created = await anon.rpc("create_group");
    expect(created.error, "未ログインの create_group() は失敗する").not.toBeNull();

    const redeemed = await anon.rpc("redeem_group_invite", { p_code: "AAAAAAAA" });
    expect(redeemed.error, "未ログインの redeem_group_invite() は失敗する").not.toBeNull();
  });

  test("グループ作成 → 招待コード → 別ユーザーが参加 → 脱退", async ({ browser }) => {
    // ---- ユーザーA: グループを作る(作成と同時に招待コードが自動発行される) ----
    const pageA = await openGroupPageAs(browser, sessionA);
    await pageA.getByRole("button", { name: "グループを作る" }).click();

    const memberA = pageA.getByRole("listitem").filter({ hasText: config.userA.email });
    await expect(memberA).toBeVisible();
    await expect(memberA.getByText("あなた")).toBeVisible();

    // 招待コード: 8文字(0/O/1/I を除いた英数字)
    const codeLocator = pageA.getByText(/^[A-HJ-NP-Z2-9]{8}$/);
    await expect(codeLocator).toBeVisible();
    const code = (await codeLocator.textContent())?.trim() ?? "";
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

    // ---- RLS: グループに入っていないBには、グループも招待コードも見えない ----
    {
      const groups = await clientB.from("groups").select("id");
      expect(groups.error).toBeNull();
      expect(groups.data).toEqual([]);
      const invites = await clientB.from("group_invites").select("code").eq("code", code);
      expect(invites.error).toBeNull();
      expect(invites.data).toEqual([]);
    }

    // ---- ユーザーB: 別の端末(別コンテキスト)で、招待コードを入力して参加する ----
    const pageB = await openGroupPageAs(browser, sessionB);
    await pageB.getByLabel("招待コード").fill(code);
    await pageB.getByRole("button", { name: "参加する" }).click();

    await expect(pageB.getByRole("listitem").filter({ hasText: config.userA.email })).toBeVisible();
    const memberB = pageB.getByRole("listitem").filter({ hasText: config.userB.email });
    await expect(memberB.getByText("あなた")).toBeVisible();

    // Aの画面でも(再読み込みで)2人になっている
    await pageA.reload();
    await expect(pageA.getByRole("listitem").filter({ hasText: config.userB.email })).toBeVisible();

    // ---- RLS: 参加後のメンバーシップ ----
    {
      const members = await clientB.from("group_members").select("user_id");
      expect(members.error).toBeNull();
      expect(members.data?.map((m) => m.user_id).sort()).toEqual([userIdA, userIdB].sort());

      // 他人の所属は消せない(削除ポリシーは本人のみ。0行の削除になり、エラーにはならない)
      await clientB.from("group_members").delete().eq("user_id", userIdA);
      const stillThere = await clientA.from("group_members").select("user_id").eq("user_id", userIdA);
      expect(stillThere.data).toHaveLength(1);

      // 使用済みの招待コードは再利用できない
      const reused = await clientA.rpc("redeem_group_invite", { p_code: code });
      expect(reused.error?.message).toContain("invite_invalid");
    }

    // ---- ユーザーB: 脱退する(確認ダイアログあり) ----
    await pageB.getByRole("button", { name: "グループを抜ける" }).click();
    await pageB.getByRole("alertdialog").getByRole("button", { name: "抜ける", exact: true }).click();
    await expect(pageB.getByRole("button", { name: "グループを作る" })).toBeVisible();

    // ---- RLS: 脱退後のBは、グループのデータを見られず、直接INSERTでも戻れない ----
    {
      const members = await clientB.from("group_members").select("user_id");
      expect(members.data).toEqual([]);

      const groupId = (await clientA.from("group_members").select("group_id").eq("user_id", userIdA).single()).data
        ?.group_id as string;
      expect(groupId).toBeTruthy();
      const rejoin = await clientB.from("group_members").insert({ group_id: groupId, user_id: userIdB });
      expect(rejoin.error, "招待を経ない直接INSERTはRLSで拒否される").not.toBeNull();
    }

    // Aの画面では、メンバーがAだけに戻る。相手の脱退はAの所属に影響しない。
    await pageA.reload();
    await expect(pageA.getByRole("listitem").filter({ hasText: config.userB.email })).toHaveCount(0);
    await expect(pageA.getByRole("listitem").filter({ hasText: config.userA.email })).toBeVisible();

    // ---- ユーザーA: 最後に抜けて、グループを空にする(後始末。空グループの掃除は docs 参照) ----
    await pageA.getByRole("button", { name: "グループを抜ける" }).click();
    await pageA.getByRole("alertdialog").getByRole("button", { name: "抜ける", exact: true }).click();
    await expect(pageA.getByRole("button", { name: "グループを作る" })).toBeVisible();

    await pageA.context().close();
    await pageB.context().close();
  });
});
