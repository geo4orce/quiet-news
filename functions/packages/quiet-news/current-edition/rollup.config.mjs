export default {
  input: "runtime.mjs",
  external: ["pg"],
  output: {
    file: "dist/index.cjs",
    format: "cjs",
    exports: "named"
  }
};
