"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./auth";
import { runAction } from "./group/runAction";
import {
  deleteRecordComment,
  fetchRecordFeedback,
  markRecordRead,
  saveRecordComment,
  type RecordComment,
  type RecordFeedbackTables,
  type RecordRead,
} from "./recordFeedback";

export interface RecordFeedbackState {
  reads: RecordRead[];
  comments: RecordComment[];
  error: string | null;
  markRead: (recordId: string) => Promise<void>;
  saveComment: (recordId: string, body: string) => Promise<boolean>;
  deleteComment: (recordId: string) => Promise<boolean>;
}

// タイムラインが使う、記録の「読んだ」印とコメントの状態と操作。
// 操作は、成功したらその場で一覧へ反映する(取り直さない)。失敗したら error に文言を入れる。
// tables は**モジュールレベルの定数**を渡すこと(レンダーごとに作ると、取得を繰り返す)。
export function useRecordFeedback(tables: RecordFeedbackTables): RecordFeedbackState {
  const { session, loading } = useAuth();
  const userId = session?.user.id ?? null;
  const [reads, setReads] = useState<RecordRead[]>([]);
  const [comments, setComments] = useState<RecordComment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !userId) return;
    // アンマウント後や依存が変わった後に解決した結果で state を触らないためのガード。
    let active = true;
    // 失敗しても記録の閲覧は妨げない(印とコメントが出ないだけ)。原因は client_errors へ送る。
    void runAction(() => fetchRecordFeedback(tables), "読んだ印とコメントの取得に失敗しました", () => {}, "list/record-feedback").then(
      (result) => {
        if (!active || !result.ok) return;
        setReads(result.value.reads);
        setComments(result.value.comments);
      }
    );
    return () => {
      active = false;
    };
  }, [loading, userId, tables]);

  const markRead = useCallback(
    async (recordId: string) => {
      if (!userId) return;
      setError(null);
      const result = await runAction(
        () => markRecordRead(tables, recordId, userId),
        "「読んだ」を保存できませんでした。もう一度お試しください。",
        setError,
        "record-feedback/mark-read"
      );
      if (!result.ok) return;
      // 別の端末ですでに押していた場合は、最初の日時を残す(DB側も最初の行を残す)。
      setReads((prev) =>
        prev.some((r) => r.recordId === recordId && r.userId === userId) ? prev : [...prev, result.value]
      );
    },
    [tables, userId]
  );

  const saveComment = useCallback(
    async (recordId: string, body: string) => {
      if (!userId) return false;
      setError(null);
      const existing = comments.find((c) => c.recordId === recordId && c.userId === userId);
      const result = await runAction(
        () => saveRecordComment(tables, existing, recordId, userId, body),
        "コメントを保存できませんでした。もう一度お試しください。",
        setError,
        "record-feedback/save-comment"
      );
      if (!result.ok) return false;
      setComments((prev) => [
        ...prev.filter((c) => !(c.recordId === recordId && c.userId === userId)),
        result.value,
      ]);
      return true;
    },
    [comments, tables, userId]
  );

  const deleteComment = useCallback(
    async (recordId: string) => {
      if (!userId) return false;
      setError(null);
      const result = await runAction(
        () => deleteRecordComment(tables, recordId, userId),
        "コメントを削除できませんでした。もう一度お試しください。",
        setError,
        "record-feedback/delete-comment"
      );
      if (!result.ok) return false;
      setComments((prev) => prev.filter((c) => !(c.recordId === recordId && c.userId === userId)));
      return true;
    },
    [tables, userId]
  );

  return useMemo(
    () => ({ reads, comments, error, markRead, saveComment, deleteComment }),
    [reads, comments, error, markRead, saveComment, deleteComment]
  );
}
