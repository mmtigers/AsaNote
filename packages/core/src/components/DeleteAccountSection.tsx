"use client";

import Link from "next/link";
import { useState } from "react";
import { DELETE_CONFIRM_PHRASE, deleteMyAccount } from "../db/account";
import { getSupabaseClient } from "../supabase/client";

// 「退会」セクション(#290。あさノート・よるノートの「共有」画面の最後)。アカウントと、両アプリの記録をすべて消す。
// 元に戻せないので、消えるものを一覧で示し、確認の文言を入力してから押してもらう。
//
// 退会できたら、まずこの端末のデータ(IndexedDB・localStorage など。ログアウトと同じ)を消してから完了を伝える。
// 完了の表示を閉じずに画面を離れても、端末に記録が残らないようにするため。閉じたらサインアウトして最初の画面へ戻る。
interface Props {
  // このアプリと、同じアカウントを使うもう一方のアプリの名前(「よるノートの記録も消えます」の表示)。
  appName: string;
  otherAppName: string;
  // 退会の前に書き出してもらうための、エクスポート画面のパス。
  exportHref: string;
  // 退会の前に行う、この端末の準備(Push 購読の解除など。サーバーの行は退会で消えるので、失敗しても続ける)。
  prepare?: () => Promise<void>;
  // 退会できたあとに、この端末のデータを消す(ログアウトと同じ手順)。
  clearLocal: () => Promise<void>;
}

export function DeleteAccountSection({ appName, otherAppName, exportHref, prepare, clearLocal }: Props) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function remove() {
    setError(null);
    setDeleting(true);
    try {
      if (prepare) {
        try {
          await prepare();
        } catch (e) {
          console.error(e);
        }
      }
      await deleteMyAccount(confirm.trim());
    } catch (e) {
      setDeleting(false);
      setError(e instanceof Error ? e.message : "退会の処理に失敗しました");
      return;
    }
    try {
      await clearLocal();
    } catch (e) {
      console.error(e);
    }
    setDeleting(false);
    setDone(true);
  }

  async function finish() {
    // アカウントはもう無いので、この端末のセッションだけを捨てる(サーバーへのサインアウトは要らない)。
    try {
      await getSupabaseClient().auth.signOut({ scope: "local" });
    } catch (e) {
      console.error(e);
    }
    window.location.replace("/");
  }

  if (done) {
    return (
      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-2)] p-4" aria-labelledby="delete-account-heading" role="status">
        <h2 id="delete-account-heading" className="text-sm font-semibold">
          退会しました
        </h2>
        <p className="text-sm">
          アカウントと記録を削除し、この端末のデータも消しました。ご利用ありがとうございました。
        </p>
        <button
          type="button"
          onClick={() => void finish()}
          className="rounded-full bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--accent-ink)]"
        >
          閉じる
        </button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-2)] p-4" aria-labelledby="delete-account-heading">
      <h2 id="delete-account-heading" className="text-sm font-semibold text-[var(--sub)]">
        退会
      </h2>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="self-start text-xs text-[var(--sub)] underline underline-offset-2">
          退会する(アカウントと記録をすべて削除)
        </button>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <p className="font-semibold text-red-600">退会すると、次のものがすべて削除され、元に戻せません。</p>
          <ul className="list-disc space-y-1 pl-5 text-xs">
            <li>
              {appName}の記録と、<strong>{otherAppName}の記録(写真を含む)</strong>。同じアカウントなので、両方とも消えます
            </li>
            <li>あなたが書いた記録とコメントは、パートナーの画面からも見えなくなります</li>
            <li>通知の設定と、ログインのためのアカウント</li>
          </ul>
          <p className="text-xs text-[var(--sub)]">
            あなたが登録したお子さまは、同じグループのパートナーがいれば、パートナーに引き継がれます(パートナーの記録も残ります)。
            グループに1人だけのときは、お子さまも削除されます。
          </p>
          <p className="text-xs">
            残しておきたい記録は、先に
            <Link href={exportHref} className="underline underline-offset-2">
              書き出し
            </Link>
            で保存してください。
          </p>
          <label className="flex flex-col gap-1 text-xs">
            <span>確認のため「{DELETE_CONFIRM_PHRASE}」と入力してください</span>
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-base outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </label>
          {error && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirm("");
                setError(null);
              }}
              disabled={deleting}
              className="flex-1 rounded-full border border-[var(--line)] py-2.5 text-sm disabled:opacity-60"
            >
              やめる
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={deleting || confirm.trim() !== DELETE_CONFIRM_PHRASE}
              className="flex-1 rounded-full bg-red-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {deleting ? "削除しています…" : "退会する"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
