import { AppHeader } from "@/components/AppHeader";

// まだ作っていない画面(下のタブから開ける)。
export function ComingSoon({ title, message }: { title: string; message: string }) {
  return (
    <>
      <AppHeader>
        <p className="text-[15px] font-bold">{title}</p>
      </AppHeader>
      <main className="mx-auto flex max-w-md flex-col gap-3 px-4 pt-4">
        <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-center text-sm leading-relaxed text-[var(--sub)]">{message}</p>
      </main>
    </>
  );
}
