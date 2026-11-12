import next from "eslint-config-next/core-web-vitals";
import ts from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";
export default defineConfig([
  ...next,
  ...ts,
  globalIgnores([
    ".next/**",
    ".next-test/**",
    "next-env.d.ts",
    "test-results/**",
  ]),
]);
