// eslint.config.js for ESLint v9+ (flat config, React/JSX support)
// NOTE: To avoid the MODULE_TYPELESS_PACKAGE_JSON warning, add "type": "module" to package.json
export default [
  {
    ignores: ["node_modules/**", "dist/**", "build/**", "**/*.min.js"],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
      parser: (await import("@babel/eslint-parser")).default,
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        },
        requireConfigFile: false
      }
    },
    plugins: {
      react: (await import("eslint-plugin-react")).default,
    },
    rules: {
      "react/jsx-uses-react": "off", // Not needed in React 17+
      "react/react-in-jsx-scope": "off", // Not needed in React 17+
      "react/prop-types": "off" // Disable if not using PropTypes
    },
    files: ["**/*.js", "**/*.jsx"],
    settings: {
      react: {
        version: "detect"
      }
    }
  }
];
