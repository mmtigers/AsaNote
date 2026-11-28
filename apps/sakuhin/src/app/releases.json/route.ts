import { releases } from "@/data/releases";

// 更新履歴を JSON で公開する(/updates ページと同じ `releases`。あさノート・よるノートと同じ形)。
// 内容は /updates に載るものと同じ公開情報で、ビルド時に静的に生成される(DBや認証には触れない)。
export const dynamic = "force-static";

export function GET() {
  return Response.json(releases);
}
