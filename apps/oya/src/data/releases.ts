export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  summary: string;
  details: string[];
}

// 新しい順に追加していく。先頭(releases[0])が最新版として扱われる。
// ユーザーに見える変更を入れるときは、ここに追加して package.json / package-lock.json の
// version も同じ値に上げる(CIの Release notes check が検査する)。
export const releases: ReleaseNote[] = [
  {
    version: "0.1.0",
    date: "2026-10-17",
    title: "おやノートの準備を始めました",
    summary: "アプリの土台を用意しました。記録の機能は、これから順に追加します。",
    details: [
      "スマホのホーム画面に追加して使えるようにしました",
      "記録・ログインの機能は、まだありません",
    ],
  },
];
