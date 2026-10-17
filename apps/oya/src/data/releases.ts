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
    version: "0.2.0",
    date: "2026-10-17",
    title: "ログインと、家族への参加ができるようになりました",
    summary: "メールに届く数字(コード)でログインし、招待コードで家族に参加できます。",
    details: [
      "メールアドレスを入力すると、ログイン用の数字が届きます。その数字を入力するとログインできます(パスワードは不要です)",
      "家族管理者が発行した招待コードを入力すると、家族に参加できます。役割(親・家族管理者・家族閲覧者)と呼び名は、管理者が決めます",
      "家族管理者は「家族の管理」で、招待コードの発行・取り消し、役割の変更、メンバーを外す操作ができます",
      "記録の機能は、これから追加します",
    ],
  },
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
