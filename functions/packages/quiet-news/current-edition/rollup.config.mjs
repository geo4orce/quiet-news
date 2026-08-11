export default {
  input: "index.mjs",
  external: ["pg"],
  output: {
    file: "dist/index.cjs",
    format: "cjs",
    exports: "named"
  }
};
