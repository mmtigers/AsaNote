// あさノート・よるノート・packages/core が共通で使う ESLint の土台(#156)。
// 各パッケージの eslint.config.mjs が取り込み、それぞれ固有の ignore などを足す。
// `eslint.config.*` という名前にしないのは、ルートで eslint を実行したときに自動で拾われないようにするため。
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export const baseConfig = [...nextVitals, ...nextTs];
