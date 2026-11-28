import Link from "next/link";

// 未ログインのときの案内。さくひんノートは作品をサーバーへ保存するので、使うにはログインが要る。
export function SignInPrompt({ message }: { message: string }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-4">
      <p className="text-sm leading-relaxed">{message}</p>
      <p className="text-xs leading-relaxed text-[var(--sub)]">
        あさノート・よるノートと同じアカウントで使えます。家族のグループとお子さまも、そのまま使えます。
      </p>
      <Link
        href="/login"
        className="rounded-full bg-[var(--accent)] py-3 text-center text-sm font-bold text-[var(--accent-ink)] focus:ring-2 focus:ring-[var(--accent)]"
      >
        ログインする
      </Link>
    </section>
  );
}
