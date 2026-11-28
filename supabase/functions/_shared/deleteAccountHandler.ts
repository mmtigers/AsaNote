// delete-account(退会: アカウントとデータの削除。#290)の本体。DB・Storage・Auth の操作を引数(store)で受け取るので、
// Vitest で「何をどの順で消すか・どこで止めるか」を確かめられる(deleteAccountHandler.test.ts)。
// index.ts は環境変数・ログインの確認と、本物のクライアントの組み立てだけを行う。
//
// 消す順(docs/mobile-app-considerations.md の「退会の検証結果」):
//   1. よるノートの写真の実体(Storage の evening-photos。パスは {user_id}/...)。evening_photos の行は
//      アカウントの削除で連鎖して消えるが、Storage の実体は残るため、先に消す。
//   2. グループの所属(group_members)。transfer_children_on_group_leave が、退会者が作った子どもを
//      同じグループのパートナーへ引き継ぐ。アカウントの削除の連鎖に任せると、children の連鎖削除との順序
//      (外部キーのトリガーの作成順)に頼ることになるため、先に明示して消す。
//   3. アカウント(auth.users)。記録・子ども(引き継がれなかったもの)・通知の設定・コメントなどは、
//      外部キーの on delete cascade で消える。グループ・招待コードの作成者などは null になる(#289)。
// 途中で失敗したら、その先は行わずにエラーを返す(もう一度押せば、続きからやり直せる。消したものは戻らない)。

// 誤って呼ばれても消さないよう、画面で入力してもらう文言をサーバーでも確かめる。
export const CONFIRM_PHRASE = "退会する";

export interface DeleteAccountStore {
  // その人の写真の Storage のパス。
  photoPaths(userId: string): Promise<string[]>;
  removePhotos(paths: string[]): Promise<void>;
  leaveGroup(userId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
}

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; code: "bad_request" | "failed"; message: string };

// Storage の削除は1回あたりの件数を抑える(大量の写真があっても、1回の要求が大きくなりすぎないように)。
export const PHOTO_BATCH = 100;

export async function runDeleteAccount(store: DeleteAccountStore, userId: string, confirm: unknown): Promise<DeleteAccountResult> {
  if (confirm !== CONFIRM_PHRASE) {
    return { ok: false, code: "bad_request", message: `確認のため「${CONFIRM_PHRASE}」と入力してください` };
  }

  let step = "photos";
  try {
    const paths = await store.photoPaths(userId);
    for (let i = 0; i < paths.length; i += PHOTO_BATCH) {
      await store.removePhotos(paths.slice(i, i + PHOTO_BATCH));
    }
    step = "group";
    await store.leaveGroup(userId);
    step = "user";
    await store.deleteUser(userId);
    return { ok: true };
  } catch (error) {
    // ログに個人の情報は出さない(どの段階で失敗したかと、エラーの種類だけ)。
    console.error(`delete-account: ${step} の削除に失敗しました`, error instanceof Error ? error.name : typeof error);
    return { ok: false, code: "failed", message: "退会の処理に失敗しました。時間をおいてもう一度お試しください" };
  }
}
