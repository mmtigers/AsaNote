export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  summary: string;
  details: string[];
}

// 新しい順に追加していく。先頭(releases[0])が最新版として扱われる。
export const releases: ReleaseNote[] = [
  {
    version: "0.2.0",
    date: "2026-09-27",
    title: "記録の見やすさとアプデ情報を改善しました",
    summary: "記録カードをシンプルにし、トップ画面でアプデ情報を確認できるようにしました。",
    details: [
      "「これまでの記録」ページのカードの1行目を、日付・曜日/結果/編集・削除アイコンのみに整理しました",
      "傾向ページのカレンダー凡例から「記録なし」「祝日」の説明を削除しました(カレンダー本体の祝日の赤字表示はそのまま残しています)",
      "トップ画面でアプリの更新情報とその履歴を確認できるようになりました",
    ],
  },
];

export const currentVersion = releases[0]?.version ?? "0.0.0";
