# 計測結果を見るための SQL と、分析プロンプト

記録フローの計測(`analytics_events`。仕様は `apps/asa/docs/SPEC.md` §11)を、Supabase の SQL Editor で集計し、Claude に分析させるための手順。

- 集計ビュー(`analytics_*`)と `analytics_events` は、anon / authenticated から読めない。**SQL Editor(または service role)から実行する**。
- 日付は JST。保管は365日(`cleanup_old_logs()`、`docs/log-retention.md`)。
- あさノートとよるノートは同じ表を共用する。よるノートのイベント名は `evening_` で始まる(`apps/yoru/docs/SPEC.md` 付録)。下の SQL はあさノート用。

## 1. 集計 SQL

期間を絞るときは、各クエリの `where` に `day >= '2026-11-01'` のような条件を足す(C・D・E は `created_at` や `client_ts`、A・B は `day`)。

```sql
-- A. 所要時間(主指標。新規記録・中断なしで完走したセッション)。日別・入り口別
select * from analytics_flow_duration_daily
order by day desc, entry_point
limit 100;

-- A2. 放置を除いた所要時間(中央値・p90)。record_saved の idle_seconds(放置の秒数)を差し引く。
--     idle_seconds が付いた版より前の行は対象外。新規記録・中断なしで完走したセッションのみ
with s as (
  select * from analytics_record_flow_sessions
  where saved and not paused and not is_resume and is_edit is not true
), idle as (
  select record_id, max((properties->>'idle_seconds')::numeric) as idle_seconds
  from analytics_events
  where event_name = 'record_saved' and properties->>'idle_seconds' is not null
  group by record_id
)
select
  (s.started_at at time zone 'Asia/Tokyo')::date as day,
  s.entry_point,
  count(*) as saved_count,
  round(percentile_cont(0.5) within group (order by greatest(s.duration_seconds - idle.idle_seconds, 0))) as median_active_seconds,
  round(percentile_cont(0.9) within group (order by greatest(s.duration_seconds - idle.idle_seconds, 0))) as p90_active_seconds,
  round(avg(idle.idle_seconds)) as avg_idle_seconds
from s join idle using (record_id)
group by day, s.entry_point
order by day desc, s.entry_point;

-- B. 各ステップの到達数(離脱率用)。現行のフローは1画面なので、有効なのは reached_form
select * from analytics_step_funnel_daily
order by day desc
limit 60;

-- C. 離脱(保存せずホームへ戻った)の理由別件数。`analytics_events` から直接数える
--    (ビュー analytics_pause_resume_daily は、2026-11-28 の時点で離脱を実際より少なく数えていた。下の注意を参照)
select
  (client_ts at time zone 'Asia/Tokyo')::date as day,
  properties->>'reason' as reason,
  count(*) as n
from analytics_events
where event_name = 'record_flow_paused'
group by 1, 2
order by 1 desc, 2;

-- D. 週別の、開始数・保存数と、保存時の入力の傾向(メモ・理由タグ・出発時刻)
select
  date_trunc('week', created_at at time zone 'Asia/Tokyo')::date as week,
  count(*) filter (where event_name = 'record_flow_started') as started,
  count(*) filter (where event_name = 'record_saved') as saved,
  round(avg((properties->>'has_memo')::boolean::int)
        filter (where event_name = 'record_saved'), 2) as memo_rate,
  round(avg((properties->>'reason_tag_count')::int)
        filter (where event_name = 'record_saved'), 2) as avg_reason_tags,
  round(avg((properties->>'depart_time_set')::boolean::int)
        filter (where event_name = 'record_saved'), 2) as depart_time_rate
from analytics_events
where event_name in ('record_flow_started', 'record_saved')
group by week
order by week desc;
```

```sql
-- E. 離脱の前に、フォームに何秒いたか(誤タップ・確認だけか、入力してから諦めたか)と、
--    その日のうちにあとで保存したか。識別子は出さない
select
  (p.client_ts at time zone 'Asia/Tokyo')::date as day,
  p.properties->>'reason' as reason,
  (select round(extract(epoch from p.client_ts - max(st.client_ts)))
     from analytics_events st
    where st.record_id = p.record_id
      and st.event_name in ('record_flow_started', 'record_flow_resumed')
      and st.client_ts <= p.client_ts) as secs_before_pause,
  exists (select 1 from analytics_events s
           where s.user_id = p.user_id
             and s.event_name = 'record_saved'
             and s.client_ts > p.client_ts
             and (s.client_ts at time zone 'Asia/Tokyo')::date
                 = (p.client_ts at time zone 'Asia/Tokyo')::date) as saved_later_same_day
from analytics_events p
where p.event_name = 'record_flow_paused'
order by day desc;
```

分析に貼るのは**集計の結果だけ**にする。`user_id` と `record_id` は貼らない。

### 結果の読み方の注意(2026-11-28 の分析で分かったこと)

- **SQL Editor は、複数の文をまとめて実行すると最後の文の結果しか表示しない。** A〜E(A2 を含む)は1つずつ選択して実行する(まとめて取るなら、`select 'A' as q, to_jsonb(t) as row from (...) t union all ...` の形にする)。
- **C はビューを使わない。** `analytics_pause_resume_daily` は、2026-11-28 の本番で、B(`analytics_step_funnel_daily`)や `analytics_events` の直接集計より離脱を少なく数えていた(10/6 以降で、直接は12回、ビューは7行)。原因は未調査。
- **離脱の大半は、数秒で戻る動き。** 2026-11-28 時点で、10/6 以降の離脱12回は、フォームを開いてから離脱まで1〜14秒だった(E)。入力してから諦めた離脱は見当たらない。「開始に対する保存の割合」は、離脱をそのまま諦めとして読まない。
- **A の所要時間は、放置した時間を含む。** フォームを開いたまま放置すると、数十分〜数日の行になる(10/28 の約5日など)。平均は使わず、中央値と分布で見る。1日に2件ある日の行は、平均で1行になっている。**放置を差し引いた値は A2**(`idle_seconds` が付いた版以降の保存だけが対象。それ以前の行は、A のまま放置を含む)。放置は、操作の間隔が60秒を超えた分を数える。
- **`record_step_viewed` は、1回の開始で複数回出ることがある。** B の `reached_form` が `flow_started` より多い日がある。ファネルの分母は `flow_started` を使う。
- **2026-10-05 を境に、記録フローは複数画面から1画面に変わった。** それ以前は `reached_form` が0で、`reached_result` / `reached_reason` が動く。期間をまたぐ比較は、そのつもりで見る(旧フローの期間は開発中のテストも混ざる)。

## 2. 分析プロンプト

上の A〜E(A2 を含む)の結果を「# データ」に貼って、Claude に渡す。

````
あなたはプロダクトのUX分析担当です。育児記録アプリ「あさノート」の
「サッと記録できる」(忙しい朝に数タップで結果を残せる)が達成できているかを、
下の計測結果から評価してください。

# 前提(計測の仕様)
- 記録フローは、ホームの開始ボタン等 → 1画面のフォーム → 保存、の流れ。
  現行のステップは `form` のみ。
- イベント: record_flow_started / record_step_viewed / record_outcome_selected /
  record_saved / record_flow_paused / record_flow_resumed
- entry_point: home_start_button / home_edit_existing / in_app_reminder /
  timeline_edit_link。date_offset_days は今日=0、過去日は負。
- 主指標は「新規記録・中断なしで完走したセッションの所要秒数」(平均/中央値/p90)。
- 計測は、メモ・タグ文言・日付そのものを送らない。ログイン前とオフライン中は取れない。
- 既知の限界:
  - record_flow_resumed は、ホームを経由せずタブを閉じて下書きが残ったケースしか対応せず、ほぼ0になる。
  - Push通知のタップ経由は計測していない(アプリ内リマインド経由のみ)。
  - beforeunload は未実装のため、タブやアプリを閉じた離脱は paused に出ない。
  - 利用者は家族単位で少人数。件数が少ない日・区分では、平均や率に意味がないことがある。

# データ
(ここに A〜E の結果を貼る)

# 依頼
1. 結論を3行で。「サッと記録できている」か、できていないか。根拠となる数値つき。
2. 所要秒数: 中央値とp90の推移、entry_point別の差。外れ値は p90 で見る。
   直近の変化があれば、その時期のアプリ更新(apps/asa/src/data/releases.ts)と結びつけて仮説を出す。
3. 離脱: started→saved の完了率、paused の理由別内訳(戻る/下部ナビ)。離脱が多い入口はどこか。
4. 入力の負担: メモ・理由タグ・出発時刻の入力率の推移。入力項目が多いほど所要時間が伸びる兆候があるか
   (データから言える範囲で)。
5. データの信頼性: 件数が少ない・欠損している・集計が成り立たない箇所を明示し、
   そこから結論を出さない。「分からない」と書くことを優先する。
6. 改善案を最大3つ。各案に「狙う指標」「期待する変化」「効果の測り方(次に見る数値)」を付ける。
   現状のデータで裏付けのない案は「仮説」と明記する。
7. 追加で計測すべきこと(足りないイベント、取れていない離脱経路)があれば、優先度つきで。

# 出力形式
- 見出し付きの短いレポート。表は数値の比較にだけ使う。
- 推測と事実を分ける(「事実:」「仮説:」と書き分ける)。
- 個人を特定する情報は出力しない。
````

### 使い方のコツ

- 件数が少ないうちは、期間を週単位に広げて貼る(D が週別なのは、そのため)。
- 改善の前後を比べるときは、A〜E を期間を分けて2回取り、「前」「後」として貼る。依頼の2番は「前後比較」に書き換える。
- よるノートを見るときは、`analytics_events` のイベント名が `evening_` 始まりになる。`apps/yoru/src/lib/analytics.ts` を見て、D のイベント名と `properties` を合わせる。集計ビューは、あさノートのイベントだけを数える。
