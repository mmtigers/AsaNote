import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// アプリと同じルールで検査する(共通コードだけ緩くならないように)。
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Next.js のアプリではないため pages/ ディレクトリが無い。この規則は pages/ 前提で、警告が出るだけなので切る。
  { rules: { "@next/next/no-html-link-for-pages": "off" } },
  globalIgnores(["coverage/**"]),
]);

export default eslintConfig;
