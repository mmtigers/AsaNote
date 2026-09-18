import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // coverage/ は npm run test:coverage の生成物(gitignore 済み)。CI は lint を
  // coverage より先に実行するので気づかないが、ローカルで順に回すと生成された
  // JS に対する指摘が出る(#60)。
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
]);

export default eslintConfig;
