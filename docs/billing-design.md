# 月額課金の設計(#292・未実装)

> 設計書です。**まだ実装していません。** 前提はオーナーの判断(2026-11-28)。
> 価格など未決の項目は、末尾の「実装前に決めること」。決済サービスの契約・料金・規約は、着手時に公式の情報で確かめる(**要確認**)。

## 1. 前提(決定事項)

| 項目 | 決定 |
|---|---|
| 課金の単位 | **家族(グループ)単位**。グループの誰か1人が払えば、同じグループの全員が有料の機能を使える |
| 無料で残すもの | **記録そのもの**(あさノート・よるノートの記録・編集・タイムライン・ログインと同期)。「選ぶだけで記録できる」が中心の価値(SPEC §1.3) |
| 有料にするもの | 家族との共有、詳しい傾向、書き出し、連絡メモの下書き など(§3 で線引きの案) |
| 今の利用者(家族) | **ずっと無料**(§5 の「既存利用者の扱い」) |
| 決済 | **Stripe**(Web の決済。アプリ化は停止中なので、ストアの課金は使わない) |
| 広告 | 入れない(子どもの心身に関するメモを扱うため。#292) |

## 2. 全体の構成

```
[画面] 「プラン」画面 ──(1) 申し込み ──▶ Edge Function: create-checkout-session ──▶ Stripe Checkout(Stripe のページで支払い)
   ▲                                                                                   │
   │ (4) 有料かどうかを読む(RPC my_plan)                                              │(2) 支払い・更新・解約・返金の通知(Webhook)
   │                                                                                   ▼
[DB] entitlements(有料かどうか)◀──(3) 書き込み ── Edge Function: stripe-webhook(署名を確かめる)
[画面] 「お支払いの管理」──▶ Edge Function: create-portal-session ──▶ Stripe Customer Portal(カードの変更・解約・領収書)
```

- **有料かどうかの正は DB(`entitlements`)**。画面は Stripe を直接見ない。Stripe の状態は Webhook で DB へ写す。
- カード番号は運営者のサーバーを通らない(Stripe のページで入力)。
- 解約・カードの変更・領収書は、Stripe の Customer Portal に任せる(画面を自作しない)。

## 3. 無料と有料の線引き(案)

| 機能 | 案 | 理由・注意 |
|---|---|---|
| 記録・編集・タイムライン・同期 | 無料 | 中心の価値 |
| 傾向(基本の集計) | 無料 | 記録の意味を感じてもらうため |
| 傾向(詳しい分析・期間比較) | 有料 | — |
| 家族との共有(グループ) | 有料 | **既に共有している家族は、解約後も閲覧は残す**(§6)。新しい招待コードの発行・参加を止める |
| 書き出し(印刷・PDF・CSV) | 有料 | データは端末にあるので、止めるのは画面だけ(技術的には完全には防げない。割り切り) |
| 連絡メモの下書き(よるノート) | 有料 | **Claude API の費用が1回7〜8円かかる**(#302)ので、最も有料にする理由が強い。サーバー(関数)で確かめられる |
| Push のリマインド | 無料 | 記録を続けてもらうための機能 |
| 子どもの複数登録 | 有料(2人目から) | 既に2人以上登録している家族は、解約後も閲覧・記録は残す |

**最終の線引きは、実装前にオーナーが確定する。** 画面とサーバーで同じ一覧を使えるよう、機能の名前(例: `share`・`export`・`stats_advanced`・`liaison_memo`・`multi_child`)の一覧を1か所(`packages/core`)に置く。

## 4. データ(`supabase/schema.sql`。main マージで本番に自動適用)

```sql
-- Stripe の顧客(1ユーザー1行)。
create table if not exists billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

-- 有料かどうか(払った人・無料の対象になった人に1行)。
create table if not exists entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  source text not null check (source in ('stripe', 'grandfathered', 'manual')),
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled')),
  plan text check (plan in ('monthly', 'yearly')),
  current_period_end timestamptz,            -- この日時まで有料(grandfathered は null = 期限なし)
  cancel_at_period_end boolean not null default false,
  stripe_subscription_id text unique,
  updated_at timestamptz not null default now()
);
```

- **書き込めるのはサーバーだけ**(service_role。Webhook の関数)。`authenticated` には select も与えず、下の RPC だけを使わせる。
- **グループ単位の判定**: 「自分、または同じグループのメンバーの誰かに、有効な `entitlements` がある」なら有料。
  有効 = `status in ('active','trialing')`、または `past_due` で猶予期間内、かつ `current_period_end` が null か未来。

```sql
-- 呼んだ人が有料の機能を使えるか(グループ単位)。画面とサーバー(関数)の両方で使う。
create or replace function my_plan() returns table (premium boolean, source text, until timestamptz)
language sql stable security definer set search_path = public as $$ ... $$;
```

- 払った人がグループを抜けると、残ったメンバーは無料に戻る(払った人の行は、払った人に付いたまま)。
- 1つのグループに入れる人数に上限を設ける(案: 6人)。上限が無いと、1人の支払いで無関係の人まで使えてしまう。
  上限は `redeem_group_invite` で確かめる(**未決**: 人数)。

## 5. 既存利用者の扱い(ずっと無料)

- 課金を始める日(**未決**)より前に登録していた利用者に、`source = 'grandfathered'`・`status = 'active'`・`current_period_end = null` の行を、
  一度だけの SQL(SQL Editor で手動。schema.sql の自動適用には入れない)で作る。
- グループ単位の判定なので、その家族のグループに後から入った人も使える。§4 のグループの人数の上限で、際限なく広がるのを防ぐ。
- 既存利用者の画面には、「ずっと無料でお使いいただけます」と出す(プラン画面)。

## 6. 解約・支払いの失敗・退会

| 場面 | 扱い |
|---|---|
| 解約 | 期間の終わり(`current_period_end`)まで有料のまま。その後は無料に戻る |
| 無料に戻ったあと | **データは消さない**。有料の機能で作ったもの(共有の記録・2人目の子どもの記録・連絡メモ)は閲覧できる。新しく作る操作(招待・連絡メモの作成・2人目の追加・書き出し)だけを止める |
| 支払いの失敗(`past_due`) | Stripe の再試行の間(案: 7日)は有料のまま。プラン画面とホームでお知らせする |
| 返金 | Webhook(`charge.refunded`)で記録する。返金で有料を止めるかは、オーナーの運用で決める |
| 課金中の退会 | **退会の関数(`delete-account`)で、先に Stripe のサブスクリプションを即時に解約**してからアカウントを消す(消えた後に請求が続かないように)。実装時に `deleteAccountHandler.ts` の順序の先頭に足し、退会画面にも「お支払いも止まります」と出す |

## 7. オフライン

記録はオフラインで使える(SPEC §7)。有料かどうかも、最後に確かめた結果(`premium`・`until`)を端末(localStorage)に持ち、
通信が無いときはそれで判断する。`until` を過ぎても、最後に確かめてから**7日**は有料のままにする
(通信が無いだけで、急に使えなくならないように)。サーバーで確かめる機能(連絡メモ)は、サーバーの判定に従う。

## 8. Edge Function(手動デプロイ。`apps/asa/docs/push-notifications-setup.md` に手順を足す)

| 関数 | 呼び出し | 処理 |
|---|---|---|
| `create-checkout-session` | 画面(ログイン中) | Stripe の顧客を作る(無ければ)→ Checkout Session を作って URL を返す。価格 ID は secrets |
| `create-portal-session` | 画面(ログイン中) | Customer Portal の URL を返す |
| `stripe-webhook` | Stripe | **署名(`Stripe-Signature`)を必ず確かめる**。`checkout.session.completed`・`customer.subscription.created/updated/deleted`・`invoice.payment_failed`・`charge.refunded` を `entitlements` へ写す。同じ通知が2回来ても同じ結果になるようにする |

secrets(`supabase secrets set`): `STRIPE_SECRET_KEY`・`STRIPE_WEBHOOK_SECRET`・`STRIPE_PRICE_MONTHLY`(・`STRIPE_PRICE_YEARLY`)。
テストは Stripe のテストモードで行い、本番の鍵はリポジトリ・ログに出さない。

## 9. 画面

- 「プラン」画面(両アプリ共通。`packages/core`): 今のプラン、価格・期間・**自動更新であること・解約の方法**、利用規約・プライバシーポリシー・特定商取引法に基づく表記へのリンク、申し込み/お支払いの管理のボタン(**要確認**: 表示が必要な項目)。
- 有料の機能の入口で、無料の人には「有料プランで使えます」と案内する(機能を隠さず、押したら案内)。
- 連絡メモの関数は、サーバーで `my_plan()` を確かめ、無料なら作らない(費用がかかるため)。

## 10. 規約・表示

- 特定商取引法に基づく表記(販売者・所在地・連絡先・価格・支払時期・解約の方法など)。個人で始めるなら、所在地・電話番号の扱いを確かめる(**要確認**)。
- 利用規約の第6条(料金)を書き直す(`docs/terms-draft.md`)。プライバシーポリシーの送信先に Stripe を足す(`docs/privacy-policy-draft.md`)。
- 税(消費税の扱い、Stripe Tax を使うか)は、始める形(個人・屋号・法人)で変わる(**要確認**)。

## 11. 進め方(案)

1. 実装前の判断(下)と、Stripe のアカウント(テストモード)の用意。
2. DB(`entitlements`・`my_plan()`・グループの人数の上限)と、既存利用者を無料にする SQL。
3. Webhook と Checkout・Portal の関数(テストモードで通しで確かめる)。
4. プラン画面と、有料の機能の入口の案内。連絡メモの関数でサーバー側の確認。
5. 退会の関数に、サブスクリプションの解約を足す。
6. 規約・表示を整え、本番の鍵に切り替えて公開。

## 実装前に決めること(オーナー)

- [ ] 価格(月額)、年額プランを並べるか、無料体験の有無と期間
- [ ] 有料にする機能の最終の一覧(§3)
- [ ] 課金を始める日(この日より前の登録者を「ずっと無料」にする)
- [ ] グループに入れる人数の上限(案: 6人)
- [ ] 始める形(個人・屋号・法人)と、特定商取引法に基づく表記の内容
- [ ] 返金の運用(返金したら有料を止めるか)
