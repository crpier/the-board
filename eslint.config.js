import js from "@eslint/js";
import ts from "typescript-eslint";
import solid from "eslint-plugin-solid";

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  // Use the plugin directly, then access the configs
  solid.configs["flat/typescript"],
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn"],
    },
  },
);
