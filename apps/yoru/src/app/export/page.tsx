"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ChildSwitcher } from "@note/core/components/ChildSwitcher";
import { OUTCOME_OPTIONS } from "@/constants/choices";
import { useAuth } from "@/lib/auth/AuthProvider";
import { addDays, formatDateLabel, toDateInputValue } from "@note/core/date";
import { useChildren } from "@/lib/db/children";
import { useGroupMembers } from "@note/core/db/groups";
import type { LocalRecord } from "@/lib/db/localDb";
import { isOwnRecord } from "@note/core/ownership";
import { getPhotoUrl, useRecordPhotos } from "@/lib/db/photos";
import { usePhotoCounts, useRecordsTimeline } from "@/lib/db/queries";
import { buildRecordPreview } from "@/lib/recordPreview";
import { buildCsvContent, buildCsvFilename, buildExportFilename, downloadCsv, selectExportEntries } from "./selectEntries";

// 印刷用に記録の写真を並べる。端末にある写真はそのまま、他端末・パートナーの写真は署名付きURLで表示する。
function PrintPhotos({ recordId }: { recordId: string }) {
  const photos = useRecordPhotos(recordId);
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    if (!photos || photos.length === 0) return;
    let active = true;
    const created: { url: string; revoke: boolean }[] = [];
    void Promise.all(photos.map((p) => getPhotoUrl(p))).then((results) => {
      for (const r of results) if (r) created.push(r);
      if (active) setUrls(created.map((r) => r.url));
      else for (const r of created) if (r.revoke) URL.revokeObjectURL(r.url);
    });
    return () => {
      active = false;
      for (const r of created) if (r.revoke) URL.revokeObjectURL(r.url);
    };
  }, [photos]);

  if (!photos || photos.length === 0 || urls.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {urls.map((url) => (
        // eslint-disable-next-line @next/next/no-img-element -- blob/署名付きURLで、next/imageの最適化対象にならない
        <img key={url} src={url} alt="" className="h-28 w-28 rounded-lg object-cover print:h-32 print:w-32" />
      ))}
    </div>
  );
}

// 学校・医療への共有を想定したエクスポート画面。サーバーへは何も送信せず、ブラウザの印刷機能
// (「PDFとして保存」)とCSVのダウンロードで完結させる。メールアドレス等は出力に含めず、
// パートナーの記録は「(パートナーの記録)」という表示のみに留める。写真は印刷/PDFに任意で含める(CSVは枚数のみ)。
export default function ExportPage() {
  const { session, loading: authLoading } = useAuth();
  const userId = session?.user.id;
  const records = useRecordsTimeline();
  const children = useChildren();
  const members = useGroupMembers();
  const photoCounts = usePhotoCounts();
  const hasPartner = (members?.length ?? 0) > 1;
  const childList = useMemo(() => children ?? [], [children]);
  const childNames = useMemo(() => new Map(childList.map((c) => [c.id, c.name])), [childList]);

  const today = useMemo(() => toDateInputValue(new Date()), []);
  const [startDate, setStartDate] = useState(() => addDays(today, -30));
  const [endDate, setEndDate] = useState(today);
  const [childId, setChildId] = useState<string | null>(null);
  const [includePartner, setIncludePartner] = useState(true);
  const [includePhotos, setIncludePhotos] = useState(false);

  const entries = useMemo(
    () =>
      records
        ? selectExportEntries(records, { startDate, endDate, childId, includePartner, currentUserId: userId, authLoading })
        : [],
    [records, startDate, endDate, childId, includePartner, userId, authLoading]
  );

  // 印刷ダイアログの「PDFとして保存」は document.title をファイル名の候補にする。
  // Metadata API が再レンダリングのたびにタイトルを書き戻すことがあるため、useEffect ではなく
  // window.print() の直前に同期的に差し替え、afterprint で元に戻す。
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

  function handleDownloadCsv() {
    const content = buildCsvContent(entries, {
      currentUserId: userId,
      authLoading,
      childNames,
      photoCounts: photoCounts ?? new Map(),
    });
    downloadCsv(buildCsvFilename(startDate, endDate), content);
  }

  const printTitleChild = childId ? childNames.get(childId) : null;

  function entryHeading(record: LocalRecord) {
    const outcome = OUTCOME_OPTIONS.find((o) => o.value === record.outcome);
    const name = record.childId ? childNames.get(record.childId) : null;
    return `${formatDateLabel(record.recordDate)} ${outcome?.emoji ?? ""}${name && !printTitleChild ? ` ${name}` : ""}`;
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pt-6 pb-10 print:max-w-none print:gap-3 print:p-0">
      <header className="print:hidden">
        <Link href="/timeline" className="text-xs text-[var(--accent)] underline underline-offset-2">
          ← これまでの記録に戻る
        </Link>
        <h1 className="mt-1 text-lg font-bold">記録をエクスポート</h1>
        <p className="mt-1 text-xs text-[var(--sub)]">
          期間と子どもを指定して、印刷・PDF保存またはCSVで出力できます。学校や医療機関への共有を想定しています。
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-2xl bg-[var(--surface-2)] p-4 print:hidden">
        {childList.length >= 2 && (
          <ChildSwitcher childList={childList} selectedId={childId} onSelect={setChildId} allowAll />
        )}
        <div className="flex items-center gap-2.5">
          <label className="w-16 flex-none text-xs text-[var(--sub)]" htmlFor="export-start">
            開始日
          </label>
          <input
            id="export-start"
            type="date"
            value={startDate}
            max={endDate}
            onChange={(e: ChangeEvent<HTMLInputElement>) => e.target.value && setStartDate(e.target.value)}
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
            onChange={(e: ChangeEvent<HTMLInputElement>) => e.target.value && setEndDate(e.target.value)}
            className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1.5 text-base font-medium tabular-nums"
          />
        </div>
        {hasPartner && (
          <label className="flex items-center gap-2 text-[13px]">
            <input
              type="checkbox"
              checked={includePartner}
              onChange={(e) => setIncludePartner(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            パートナーの記録も含める
          </label>
        )}
        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={includePhotos}
            onChange={(e) => setIncludePhotos(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          印刷/PDFに写真を含める(CSVは枚数のみ)
        </label>
        <p className="text-[11px] text-[var(--sub)]">対象: {entries.length}件</p>
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
        夜の記録{printTitleChild ? `(${printTitleChild})` : ""}({formatDateLabel(startDate)}〜{formatDateLabel(endDate)})
      </h2>

      {records === undefined ? null : entries.length === 0 ? (
        <p className="rounded-2xl bg-[var(--surface-2)] px-4 py-6 text-center text-sm text-[var(--sub)] print:hidden">
          この期間の記録がありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-3 print:gap-2">
          {entries.map((record) => (
            <li
              key={record.id}
              className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 print:break-inside-avoid print:rounded-none print:border-0 print:border-b print:border-[#ddd] print:px-0 print:py-2"
            >
              <p className="text-sm font-bold">
                {entryHeading(record)}
                {!isOwnRecord(record, userId, authLoading) && (
                  <span className="ml-2 text-xs font-normal text-[var(--sub)]">(パートナーの記録)</span>
                )}
              </p>
              <p className="mt-1 text-sm leading-relaxed">
                {buildRecordPreview({ ...record, photoCount: photoCounts?.get(record.id) ?? 0 })}
              </p>
              {includePhotos && <PrintPhotos recordId={record.id} />}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
