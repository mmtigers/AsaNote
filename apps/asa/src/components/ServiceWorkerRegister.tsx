"use client";

import { registerClientErrorContextProvider } from "@note/core/clientErrors";
import { ServiceWorkerRegister as ServiceWorkerRegisterBase } from "@note/core/components/ServiceWorkerRegister";
import { countUnsyncedChanges } from "@/lib/db/records";
import { registerSyncListeners } from "@/lib/db/sync";
import { getLastSuccessAt } from "@/lib/db/syncStatus";

// エラーを client_errors へ送る時の付帯情報(#213)。件数と経過時間だけで、記録の内容は入れない。
async function errorContext() {
  const lastOk = getLastSuccessAt();
  return {
    pendingCount: await countUnsyncedChanges(),
    lastSyncOkSecAgo: lastOk === null ? null : Math.round((Date.now() - lastOk) / 1000),
  };
}

// 登録後に、このアプリの同期のリスナーを張り、エラー報告の付帯情報の取得元を登録する
// (モジュールレベルの安定した関数を渡す)。解除用の関数を返す。
function onRegistered() {
  const stopSync = registerSyncListeners();
  registerClientErrorContextProvider(errorContext);
  return () => {
    stopSync?.();
    registerClientErrorContextProvider(null);
  };
}

// 登録は @note/core。
export function ServiceWorkerRegister() {
  return <ServiceWorkerRegisterBase onRegistered={onRegistered} />;
}
