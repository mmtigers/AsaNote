import { defineConfig, globalIgnores } from "eslint/config";
import { baseConfig } from "../../eslint.base.mjs";

const eslintConfig = defineConfig([
  ...baseConfig,
  // coverage/ は npm run test:coverage の生成物(gitignore 済み)。
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),
]);

export default eslintConfig;
