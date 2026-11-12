"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { APP_ID } from "@/lib/appConfig";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useChildren } from "@/lib/db/children";
import { fetchLiaisonMemos, fetchLiaisonSettings } from "@/lib/db/liaisonMemos";
import { noticeMemo, type LiaisonMemo, type LiaisonSettings } from "@/lib/liaisonMemo";

// ホームに出す連絡メモのお知らせ(docs/liaison-memo.md §3・§7)。
//   1. 今週の下書きができていて、まだ「送った」にしていない(または作れなかった)とき。
//   2. 家族のほかの人が連絡メモをオンにしたとき(一度だけ。記録が AI に送られることを知らせる。L9)。
// ログインしていない・オンにしている子どもがいない家庭では何も出さない(読み込みに失敗しても出さない)。
const CONSENT_SEEN_KEY = `${APP_ID}:liaison-consent-seen`;

function readSeen(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(CONSENT_SEEN_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function markSeen(keys: string[]) {
  try {
    window.localStorage.setItem(CONSENT_SEEN_KEY, JSON.stringify([...new Set([...readSeen(), ...keys])]));
  } catch {
    // 保存できない環境では、次に開いたときにもう一度出る(害は無い)。
  }
}

export function consentKey(settings: LiaisonSettings): string {
  return `${settings.childId}@${settings.consentedAt ?? ""}`;
}

// 家族のほかの人がオンにして、この端末でまだ知らせていない設定。
export function unseenConsents(settings: LiaisonSettings[], currentUserId: string, seen: string[]): LiaisonSettings[] {
  return settings.filter((s) => s.enabled && s.consentedAt && s.consentedBy !== currentUserId && !seen.includes(consentKey(s)));
}

export function LiaisonMemoNotice() {
  const { session } = useAuth();
  const children = useChildren();
  const userId = session?.user.id ?? null;
  const [memo, setMemo] = useState<LiaisonMemo | null>(null);
  const [consents, setConsents] = useState<LiaisonSettings[]>([]);
  const childIds = (children ?? []).map((c) => c.id).join(",");

  useEffect(() => {
    if (!userId || !childIds) return;
    let active = true;
    (async () => {
      const settings = [...(await fetchLiaisonSettings(childIds.split(","))).values()].filter((s) => s.enabled);
      const memos = (await Promise.all(settings.map((s) => fetchLiaisonMemos(s.childId, 2)))).flat();
      if (!active) return;
      setMemo(noticeMemo(memos, new Date()));
      setConsents(unseenConsents(settings, userId, readSeen()));
    })().catch(() => {
      // お知らせは補助なので、読み込めなくても画面には何も出さない。
    });
    return () => {
      active = false;
    };
  }, [userId, childIds]);

  const nameOf = (childId: string) => children?.find((c) => c.id === childId)?.name ?? "";
  const many = (children?.length ?? 0) > 1;

  return (
    <>
      {consents.length > 0 && (
        <div role="status" className="flex flex-col gap-2 rounded-2xl bg-[var(--surface-2)] px-4 py-3 text-[13px]">
          <span>
            家族の方が{many ? `${consents.map((c) => nameOf(c.childId)).join("・")}の` : ""}
            連絡メモの下書きをオンにしました。毎週、記録(メモ欄を含む)が AI での要約に使われます。
          </span>
          <div className="flex gap-3">
            <Link href="/group" className="underline underline-offset-2">
              設定を見る
            </Link>
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => {
                markSeen(consents.map(consentKey));
                setConsents([]);
              }}
            >
              わかりました
            </button>
          </div>
        </div>
      )}
      {memo && (
        <Link
          href="/memo"
          role="status"
          className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--accent-soft)] px-4 py-3 text-[13px] font-medium text-[var(--accent)]"
        >
          <span>
            📝 {many ? `${nameOf(memo.childId)}の` : ""}
            {memo.status === "failed" ? "連絡メモの下書きを作れませんでした" : "今週の連絡メモの下書きができました"}
          </span>
          <span className="flex-none underline underline-offset-2">開く</span>
        </Link>
      )}
    </>
  );
}
