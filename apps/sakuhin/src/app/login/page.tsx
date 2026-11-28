"use client";

import { LoginView } from "@note/core/components/LoginView";
import { otpCooldown } from "@/lib/otpCooldown";

// 画面は @note/core(あさノート・よるノートと同じログイン)。補足の文言だけ、さくひんノートに合わせる。
export default function LoginPage() {
  return (
    <LoginView
      cooldown={otpCooldown}
      note="さくひんノートは、作品の写真をサーバーに保存するため、ログインして使います。あさノート・よるノートと同じアカウントで使えます。"
    />
  );
}
