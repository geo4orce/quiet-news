import { REJECTION_CODES } from "./sift-result.mjs";

export function generationSummary(editionDate, metadata) {
  const { discovery, sift } = metadata || {};
  if (![discovery?.candidateCount, sift?.acceptedCount, sift?.rejectedCount]
    .every(Number.isInteger)) return [];

  const rejections = REJECTION_CODES
    .filter((code) => Number.isInteger(sift.rejectionCounts?.[code]) && sift.rejectionCounts[code] > 0)
    .map((code) => `${sift.rejectionCounts[code]} ${code.replaceAll("_", " ")}`);
  return [
    `Quiet News (${editionDate}): ${discovery.candidateCount} candidates, ${sift.acceptedCount} published, ${sift.rejectedCount} rejected`,
    `Rejections: ${rejections.length ? rejections.join(", ") : "none"}`
  ];
}
