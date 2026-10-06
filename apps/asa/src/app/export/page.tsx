"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { addDays, formatDateLabel, toDateInputValue } from "@note/core/date";
import { useGroupMembers } from "@/lib/db/groups";
import { isOwnRecord } from "@/lib/db/ownership";
import { useRecordsTimeline } from "@/lib/db/queries";
import { buildDiaryText } from "@/lib/recordPreview";
import { buildCsvContent, buildCsvFilename, buildExportFilename, downloadCsv, selectExportEntries } from "./selectEntries";

// 学校・カウンセラー等への共有を想定したエクスポート画面。サーバーへは何も送信せず、
// ブラウザの印刷機能(「PDFとして保存」)で完結させる(#2)。メールアドレス等の個人情報は
// 出力に含めず、パートナーの記録は「(パートナーの記録)」という表示のみに留める。
export default function ExportPage() {
  const { session, loading: authLoading } = useAuth();
  const records = useRecordsTimeline();
  const members = useGroupMembers();
  const hasPartner = (members?.length ?? 0) > 1;

  const today = useMemo(() => toDateInputValue(new Date()), []);
  const [startDate, setStartDate] = useState(() => addDays(today, -30));
  const [endDate, setEndDate] = useState(today);
  const [includePartner, setIncludePartner] = useState(true);

  const entries = useMemo(() => {
    if (!records) return [];
    return selectExportEntries(records, {
      startDate,
      endDate,
      includePartner,
      currentUserId: session?.user.id,
      authLoading,
    });
  }, [records, startDate, endDate, includePartner, session?.user.id, authLoading]);

  // 印刷ダイアログの「PDFとして保存」はdocument.titleをファイル名の候補にするため、
  // このページを開いている間だけ期間入りのファイル名に差し替える(#2-2)。
  // 印刷ダイアログの「PDFとして保存」はdocument.titleをファイル名の候補にする。
  // useEffectでdocument.titleを持続的に差し替える案は、Next.jsのMetadata API
  // (layout.tsxのtitle)が別の再レンダリングのたびに"あさノート"へ書き戻してしまい
  // 効果が消えてしまったため(#2-2)、window.print()を呼ぶ直前の同期処理で
  // 差し替える方式にしている(このイベントハンドラ内では再レンダリングが割り込まない)。
  // afterprintで印刷後に元のタブタイトルへ戻す。
  function handlePrint() {
    const original = document.title;
    document.title = buildExportFilename(startDate, endDate);
    const restoreTitle = () => {
      document.title = original;
      window.removeEventListener("afterprint", restoreTitle);
    };
    window.addEventListener("afterprint", restoreTitle);
    window.print();
  }

  // CSVは印刷/PDF保存とは別に、Excel等で並び替え・集計しやすい列形式で出力する(#4-2)。
  function handleDownloadCsv() {
    const content = buildCsvContent(entries, session?.user.id, authLoading);
    downloadCsv(buildCsvFilename(startDate, endDate), content);
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6 pb-10 print:max-w-none print:gap-3 print:p-0">
      <header className="print:hidden">
        <Link href="/timeline" className="text-xs text-[var(--accent)] underline underline-offset-2">
          ← これまでの記録に戻る
        </Link>
        <h1 className="mt-1 text-lg font-bold">記録をエクスポート</h1>
        <p className="mt-1 text-xs text-[var(--sub)]">
          期間を指定して日記形式で出力し、印刷またはPDF保存できます。学校の先生やスクールカウンセラーへの共有を想定しています。
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-2)] p-4 print:hidden">
        <div className="flex items-center gap-2.5">
          <label className="w-16 flex-none text-xs text-[var(--sub)]" htmlFor="export-start">
            開始日
          </label>
          <input
            id="export-start"
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value)}
            className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-base font-medium tabular-nums"
          />
        </div>
        <div className="flex items-center gap-2.5">
          <label className="w-16 flex-none text-xs text-[var(--sub)]" htmlFor="export-end">
            終了日
          </label>
          <input
            id="export-end"
            type="date"
            value={endDate}
            min={startDate}
            max={today}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value)}
            className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-base font-medium tabular-nums"
          />
        </div>
        {hasPartner && (
          <label className="flex items-center gap-2 text-[13px] text-[var(--ink)]">
            <input
              type="checkbox"
              checked={includePartner}
              onChange={(e) => setIncludePartner(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            パートナーの記録も含める
          </label>
        )}
        <button
          type="button"
          onClick={handlePrint}
          disabled={entries.length === 0}
          className="rounded-full bg-[var(--accent)] py-3 text-sm font-bold text-[var(--accent-ink)] disabled:opacity-60"
        >
          🖨️ 印刷する(PDFとして保存も可能)
        </button>
        <button
          type="button"
          onClick={handleDownloadCsv}
          disabled={entries.length === 0}
          className="rounded-full border border-[var(--accent)] py-3 text-sm font-bold text-[var(--accent)] disabled:opacity-60"
        >
          📊 CSVでダウンロード
        </button>
      </section>

      <h2 className="hidden text-base font-bold print:block">
        登校の記録({formatDateLabel(startDate)}〜{formatDateLabel(endDate)})
      </h2>

      {entries.length === 0 ? (
        <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-center text-sm text-[var(--sub)] print:hidden">
          この期間の記録がありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-3 print:gap-2">
          {entries.map((record) => {
            const own = isOwnRecord(record, session?.user.id, authLoading);
            return (
              <li
                key={record.id}
                className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 print:break-inside-avoid print:rounded-none print:border-0 print:border-b print:border-[#ddd] print:px-0 print:py-2"
              >
                <p className="text-sm font-bold">
                  {formatDateLabel(record.recordDate)}
                  {!own && <span className="ml-2 text-xs font-normal text-[var(--sub)]">(パートナーの記録)</span>}
                </p>
                <p className="mt-1 text-sm leading-relaxed">{buildDiaryText(record)}</p>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
