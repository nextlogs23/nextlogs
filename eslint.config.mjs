import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The existing application intentionally initializes client state from
    // authenticated/network sources in effects. Keep that established pattern
    // while retaining the rest of the Next.js Core Web Vitals ruleset.
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
  globalIgnores([".next/**", ".next-locked-*/**", "out/**", "build/**", "next-env.d.ts"]),
]);
