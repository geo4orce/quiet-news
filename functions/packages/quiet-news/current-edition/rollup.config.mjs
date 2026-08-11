export default {
  input: "index.mjs",
  external: ["pg"],
  output: {
    file: "dist/index.mjs",
    format: "es"
  }
};
