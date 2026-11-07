export const textSettings = {
  model: "mock-text",
  collection: { reasoningEffort: "low", maxOutputTokens: 600, webSearch: true, maxToolCalls: 2, finalMaxToolCalls: 4 },
  discovery: { reasoningEffort: "medium", maxOutputTokens: 500, webSearch: true },
  sift: { reasoningEffort: "high", maxOutputTokens: 800, webSearch: false }
};

export const imageOptions = {
  model: "mock-image", quality: "low", size: "1536x1024",
  output_format: "jpeg", output_compression: 60, n: 1
};
