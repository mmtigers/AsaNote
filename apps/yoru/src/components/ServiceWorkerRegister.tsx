"use client";

import { ServiceWorkerRegister as ServiceWorkerRegisterBase } from "@note/core/components/ServiceWorkerRegister";
import { registerSyncListeners } from "@/lib/db/sync";

// 登録は @note/core。登録後に、このアプリの同期のリスナーを張る(モジュールレベルの安定した関数を渡す)。
export function ServiceWorkerRegister() {
  return <ServiceWorkerRegisterBase onRegistered={registerSyncListeners} />;
}
