// 下部ナビの「記録する」を、既にホームルートにいる状態で押したときに、記録フォームを
// 閉じてホームへ戻すための通知。ルートが変わらないため画面が作り直されず、そのままでは
// フォームが残ってしまう。
export const RECORD_FLOW_RESET_EVENT = "yoru-note:record-flow-reset";

export function requestRecordFlowReset() {
  window.dispatchEvent(new Event(RECORD_FLOW_RESET_EVENT));
}
