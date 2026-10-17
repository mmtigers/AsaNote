"use client";

import { createOtpCooldown } from "@note/core/otpCooldown";
import { APP_ID } from "@/lib/appConfig";

// 実装は @note/core/otpCooldown。このアプリ用のインスタンスを作って公開する。
export const otpCooldown = createOtpCooldown(APP_ID);
