import { AuthStatus } from "@/components/AuthStatus";

export default function Home() {
  return (
    <main className="mx-auto max-w-md px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <h1 className="text-xl font-bold">🌙 よるノート</h1>
        <AuthStatus />
      </header>
      <p className="mt-2 text-sm text-[var(--sub)]">
        帰宅から就寝までの夜のようすを、寝る前にサッと記録します。(準備中)
      </p>
    </main>
  );
}
