import { reportHandledError } from "@note/core/clientErrors";
import { clearChildrenCache } from "@note/core/db/children";
import { clearDraft } from "@/app/_home/draftStorage";
import { clearLocalData } from "@/lib/db/localDb";
import { clearReminderDismissal } from "@/lib/db/reminderDismissal";
import { setSelectedChildId } from "@/lib/db/selectedChild";

// この端末に残る、ログインしていた人のデータを消す(ログアウト・退会で共通。#131・#290)。
// 共有端末で前の人のデータが残り、次にログインした別の人のアカウントへ誤って同期されたり、
// 入力途中の下書き(メモを含む)や選択中の子どもが次の人の画面に出たりするのを防ぐ。
export async function clearThisDevice(): Promise<void> {
  try {
    await clearLocalData();
  } catch (error) {
    console.error(error);
    reportHandledError("auth/clear-local-data", error);
  }
  clearDraft();
  setSelectedChildId(null);
  clearReminderDismissal();
  clearChildrenCache();
}
