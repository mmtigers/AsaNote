import { releases } from "@/data/releases";

// 更新履歴を JSON で公開する(/updates ページと同じ `releases`)。
// お家ダッシュボード(my_python_project の MY_HOME_SYSTEM)の「アップデート」ページが、
// 全アプリの更新履歴を1本に並べて見せるために、サーバー側から取得する。
// 内容は /updates に載るものと同じ公開情報で、ビルド時に静的に生成される(DBや認証には触れない)。
// 形(version / date / title / summary / details[])を変えるときは、ダッシュボード側の
// release_history_service の正規化と合わせること。
export const dynamic = "force-static";

export function GET() {
  return Response.json(releases);
}
