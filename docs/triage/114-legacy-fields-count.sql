-- #114: 2027年9月頃に、旧フィールドを持つ記録がどれだけ残っているかを数える(読み取り専用)。
-- 本番の SQL Editor で実行する。select のみ。変更・削除はしない。
-- 判断の目安: 旧フィールドを持つ行が 0、または全体に対して無視できる割合なら、#114 の一括削除に進む。
select
  count(*)                                                        as total_records,
  count(*) filter (where struggled is not null)                   as with_struggled,
  count(*) filter (where cardinality(wake_tags) > 0)              as with_wake_tags,
  count(*) filter (where cardinality(trigger_tags) > 0)           as with_trigger_tags,
  count(*) filter (where cardinality(response_tags) > 0)          as with_response_tags,
  count(*) filter (where companion is not null and companion <> '') as with_companion,
  count(*) filter (where handoff is not null and handoff <> '')   as with_handoff,
  count(*) filter (
    where struggled is not null
       or cardinality(wake_tags) > 0 or cardinality(trigger_tags) > 0
       or cardinality(response_tags) > 0
       or (companion is not null and companion <> '')
       or (handoff is not null and handoff <> '')
  )                                                               as with_any_legacy
from records;
