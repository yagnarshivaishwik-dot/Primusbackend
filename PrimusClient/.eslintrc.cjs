module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  settings: {
    react: {
      version: "detect",
    },
  },
  plugins: ["react-refresh", "react-hooks", "@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:react-hooks/recommended",
  ],
  rules: {
    "react-refresh/only-export-components": "warn",
    // Allow unused vars/args that start with underscore
    "no-unused-vars": ["error", {
      "argsIgnorePattern": "^_",
      "varsIgnorePattern": "^_"
    }],
    // Allow empty catch blocks (often intentional for ignored errors)
    "no-empty": ["error", { "allowEmptyCatch": true }],
  },
  ignorePatterns: ["dist", "build", "node_modules"],
};



