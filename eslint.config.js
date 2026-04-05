import js from "@eslint/js";
import ts from "typescript-eslint";
import solid from "eslint-plugin-solid";

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  // Use the plugin directly, then access the configs
  solid.configs["flat/typescript"],
  {
    ignores: [
      ".output/**",
      ".vinxi/**",
      "node_modules/**",
      "convex/_generated/**",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn"],
    },
  },
);
