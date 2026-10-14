"use client";

import { LoginView } from "@note/core/components/LoginView";
import { otpCooldown } from "@/lib/otpCooldown";

// 画面は @note/core。再送クールダウンの保存先(アプリごとのキー)だけ、このアプリのものを渡す。
export default function LoginPage() {
  return <LoginView cooldown={otpCooldown} />;
}
