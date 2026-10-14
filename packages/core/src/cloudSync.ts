// あさノート・よるノートの sync.ts(端末の IndexedDB とクラウドの同期)のうち、**両アプリで同一だった部分**。
// push・pull の本体(どのテーブルを、どう変換して送る・取り込むか。よるノートは写真もある)は、アプリごとに違うので各アプリの
// sync.ts に残す。ここに置くのは、ページ送りの取得・前面に戻ったときの取り込みの組み立て・同期の起動の購読・失敗の報告だけ(#202)。
import { reportClientError, type ClientErrorApp } from "./clientErrors";
import { createResumePuller, type ResumePuller } from "./pullOnResume";
import { getSupabaseClient } from "./supabase/client";

// pullの1ページあたりの取得件数。PostgRESTは1リクエストの最大行数(既定 max-rows=1000)を
// 黙って切り捨てるため、安定した順序でこの件数ずつ全ページ取得する(#55)。
// 以前はページングが無く、取得できなかった行を「クラウドから見えなくなった」と誤判定して
// ローカルから削除してしまう経路があった。
export const PULL_PAGE_SIZE = 500;

/**
 * 同期の失敗を client_errors へ送る関数を作る。画面には「同期に失敗しています」としか出ないので、原因(Supabaseのエラー内容)を
 * あとから調べられるようにするため。記録の中身は送らず、どの段階(phase)で何件失敗したかだけを付ける。
 */
export function createSyncFailureReporter(app: ClientErrorApp, appVersion: string | undefined) {
  return function reportSyncFailure(phase: string, error: unknown, count?: number) {
    reportClientError(app, "sync-failure", error, appVersion, { phase, count: count ?? null });
  };
}

/**
 * テーブルを PULL_PAGE_SIZE 件ずつ、`orderBy`・`id` の順で全ページ取得する。途中のページが失敗したら、
 * `onError` を呼んで null を返す(部分的な結果で「見えなくなった行の削除」を判定すると、取得漏れの行が消えるため)。
 */
export async function fetchAllPages<T>(
  table: string,
  orderBy: string,
  onError: (error: unknown, offset: number) => void
): Promise<T[] | null> {
  const supabase = getSupabaseClient();
  const all: T[] = [];
  for (let from = 0; ; from += PULL_PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order(orderBy, { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PULL_PAGE_SIZE - 1);
    if (error) {
      onError(error, from);
      return null;
    }
    const page = (data ?? []) as T[];
    all.push(...page);
    if (page.length < PULL_PAGE_SIZE) break;
  }
  return all;
}

/**
 * 前面に戻ったときの取り込み(#125)。前回の取り込み時刻は、起動時・ログイン時などの pullFromCloud も更新する。
 * ログイン済みかはローカルのセッションで見る(getUser はサーバーへ問い合わせるため、復帰のたびには使わない)。
 */
export function createCloudResumePuller(pull: () => Promise<unknown>): ResumePuller {
  return createResumePuller({
    pull,
    isSignedIn: async () => {
      const { data } = await getSupabaseClient().auth.getSession();
      return data.session !== null;
    },
  });
}

/**
 * 起動時とオンライン復帰時に同期をトリガーし、前面に戻ったときは(5分以上空いていれば)取り込む関数を作る。
 * オフライン中の変更をキャッシュに残したままバックグラウンドで送信するため、UI側の待ち時間は発生しない。
 * 戻り値の関数は、StrictMode や再マウントで二重に張らないよう、呼び出し側(ServiceWorkerRegister)がクリーンアップで解除する。
 */
export function createSyncListenersRegistrar(syncPendingChanges: () => Promise<unknown>, resumePuller: ResumePuller) {
  return function registerSyncListeners(): (() => void) | undefined {
    if (typeof window === "undefined") return;

    const onOnline = () => {
      void syncPendingChanges();
    };
    window.addEventListener("online", onOnline);
    const stopResumePull = resumePuller.register();

    void syncPendingChanges();

    return () => {
      window.removeEventListener("online", onOnline);
      stopResumePull();
    };
  };
}
