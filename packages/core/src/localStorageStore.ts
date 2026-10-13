"use client";

import { useSyncExternalStore } from "react";
import { reportHandledError } from "./clientErrors";

/**
 * 「localStorage に1つの文字列を持ち、変更を同一タブへ通知して React から購読する」
 * という定型を1箇所にまとめたもの(#62)。
 *
 * 以前は selectedChild.ts / reminderDismissal.ts / draft.ts が、読み書きの try/catch・
 * カスタムイベントの dispatch と addEventListener・`useSyncExternalStore` の
 * 組み立てを各自でほぼ同じ形に書いていた。
 *
 * try/catch が要るのは、プライベートブラウジングやサイトデータのブロック時に
 * localStorage へのアクセス自体が throw するため。ここでの失敗は「値が無い」として
 * 扱い、呼び出し元の操作（子どもの選択、通知を閉じる、下書きの保存）は続行させる。
 *
 * `storage` イベントは**別タブ**にしか飛ばないので、自タブの購読者へ届けるための
 * カスタムイベントを必ず別途 dispatch する。逆に別タブの変更まで拾いたい場合だけ
 * `crossTab` を立てて `storage` も購読する。
 */
export interface LocalStorageStoreOptions {
  /** `storage` イベント(別タブでの変更)も購読するか。既定は false(自タブのみ)。 */
  crossTab?: boolean;
}

export interface LocalStorageStore {
  /** localStorage の現在値。読めない環境では null。 */
  get(): string | null;
  /** 値を保存し、購読者へ通知する。null を渡すとキーごと消す。書けなくても throw しない。 */
  set(value: string | null): void;
  /** 値を変えずに購読者へ通知する(書き込みが別モジュールにある場合に使う)。 */
  notify(): void;
  /** 現在値を返す React フック。SSR 時は null。 */
  use(): string | null;
}

export function createLocalStorageStore(
  key: string,
  changedEvent: string,
  { crossTab = false }: LocalStorageStoreOptions = {},
): LocalStorageStore {
  function get(): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      reportHandledError("storage/unavailable", error, { op: "get" });
      return null;
    }
  }

  function notify(): void {
    window.dispatchEvent(new Event(changedEvent));
  }

  function set(value: string | null): void {
    try {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
      notify();
    } catch (error) {
      // 書けない環境ではあきらめる(呼び出し元の操作自体は続行できる)
      reportHandledError("storage/unavailable", error, { op: "set" });
    }
  }

  function subscribe(callback: () => void): () => void {
    window.addEventListener(changedEvent, callback);
    if (crossTab) window.addEventListener("storage", callback);
    return () => {
      window.removeEventListener(changedEvent, callback);
      if (crossTab) window.removeEventListener("storage", callback);
    };
  }

  function use(): string | null {
    return useSyncExternalStore(subscribe, get, () => null);
  }

  return { get, set, notify, use };
}
