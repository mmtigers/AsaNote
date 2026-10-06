"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * 未ログインが確定したときに何を返すか。
 *
 * 呼び出し元によって意味が違うため、共通化にあたって明示的に選ばせている(#62)。
 * - `"null"`: 「まだ分からない」と同じ扱いにする。`useChildren` はこちら。
 *   子ども一覧が未確定の間に「子ども0人」と解釈されると、記録の絞り込みが
 *   誤った結果になるため。
 * - `"empty"`: 「0件で確定」として扱う。`useGroupMembers` はこちら。
 *   未ログインならパートナーは居ないと言い切れる。
 */
type SignedOutValue = "null" | "empty";

/**
 * ログイン状態に応じて一覧を取得する軽量フック。
 *
 * 読み込み中は `null`、取得できれば(0件含め)配列を返す。取得に失敗した場合は
 * 空配列にフォールバックする(一覧が出ないだけで画面自体は使えるようにするため)。
 *
 * `fetchList` は**モジュールレベルの安定した関数**を渡すこと。レンダーごとに
 * 新しい関数を渡すと、依存配列が毎回変わって取得を繰り返す。
 */
export function useAuthedList<T>(
  fetchList: () => Promise<T[]>,
  { whenSignedOut }: { whenSignedOut: SignedOutValue }
): T[] | null {
  const { session, loading } = useAuth();
  const [items, setItems] = useState<T[] | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 未ログイン確定後に一度だけ値を確定させる後始末で、フェッチ自体は発生しない
      setItems(whenSignedOut === "empty" ? [] : null);
      return;
    }
    // アンマウント後や依存が変わった後に解決した結果で state を触らないためのガード。
    let active = true;
    fetchList()
      .then((data) => {
        if (active) setItems(data);
      })
      .catch(() => {
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
  }, [loading, session, fetchList, whenSignedOut]);

  return items;
}
