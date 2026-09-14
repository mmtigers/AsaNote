"use client";

// パートナー(自分以外のグループメンバー)が作成した記録に付与する、誰の記録かの目印。
// メールアドレスの先頭1文字を丸バッジで表示する軽量な代替アバター。
export function PartnerAvatar({ email }: { email: string | null | undefined }) {
  const trimmed = (email ?? "").trim();
  const initial = trimmed ? trimmed[0].toUpperCase() : "?";

  return (
    <span
      title={trimmed || "パートナーの記録"}
      aria-label={trimmed ? `${trimmed}の記録` : "パートナーの記録"}
      className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[var(--accent-soft)] text-[10px] font-bold text-[var(--accent)]"
    >
      {initial}
    </span>
  );
}
