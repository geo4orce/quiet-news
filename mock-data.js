const MOCK_STORIES = [
  {
    id: "mock-heat-alerts",
    headline: "Five neighboring cities agree on a shared heat-alert standard",
    summary:
      "The fictional municipalities will use the same warning levels and public guidance during periods of extreme heat. The mock agreement is intended to make regional travel and school decisions easier to understand.",
    since_yesterday:
      "The mock story advanced from separate city proposals to one signed regional standard.",
    status: "developing",
    sources: [
      { name: "Example Newsroom", url: "https://example.com/mock/heat-alerts" },
      { name: "Sample Public Radio", url: "https://example.com/mock/regional-weather" }
    ]
  },
  {
    id: "mock-late-rail",
    headline: "Regional rail pilot adds late-night service on two lines",
    summary:
      "A fictional transit agency will test hourly trains after midnight on weekends. Officials say the mock pilot will measure demand, reliability, and connections with overnight bus routes.",
    since_yesterday:
      "The proposed pilot now has a fictional start date and a published test schedule.",
    status: "new",
    sources: [
      { name: "Example Transit Desk", url: "https://example.com/mock/late-rail" }
    ]
  },
  {
    id: "mock-battery-benchmark",
    headline: "University group releases an open battery-recycling benchmark",
    summary:
      "The fictional research consortium published a common way to compare recovery rates, energy use, and material purity. The mock benchmark is designed to make competing recycling claims easier to evaluate.",
    since_yesterday:
      "The fictional benchmark moved from peer review to a public release with test data.",
    status: "developing",
    sources: [
      { name: "Sample Science Journal", url: "https://example.com/mock/battery-benchmark" },
      { name: "Example University News", url: "https://example.com/mock/open-data" }
    ]
  },
  {
    id: "mock-library-translation",
    headline: "Public libraries expand same-day translation help",
    summary:
      "A fictional library network is adding scheduled interpreters for civic forms, school notices, and basic digital services. The mock program keeps legal and medical interpretation outside its scope.",
    since_yesterday:
      "The fictional program expanded from three pilot branches to the full library network.",
    status: "no_material_change",
    sources: [
      { name: "Example Civic Bulletin", url: "https://example.com/mock/library-translation" }
    ]
  },
  {
    id: "mock-dune-restoration",
    headline: "Coastal restoration trial reports stronger dune growth",
    summary:
      "A fictional shoreline project found that mixed native grasses retained more sand than single-species plots. The mock results cover one year and do not yet establish long-term storm protection.",
    since_yesterday:
      "The fictional project released its first measured results after previously sharing only its design.",
    status: "new",
    sources: [
      { name: "Sample Coastal Review", url: "https://example.com/mock/dune-growth" },
      { name: "Example Environment Desk", url: "https://example.com/mock/coastal-trial" }
    ]
  }
];

function newYorkDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function mockCountFromSearch(search) {
  const value = new URLSearchParams(search).get("mock");
  return /^[0-5]$/.test(value ?? "") ? Number(value) : null;
}

export function createMockSnapshot(count, now = new Date()) {
  if (!Number.isInteger(count) || count < 0 || count > 5) {
    throw new RangeError("Mock story count must be an integer from zero to five.");
  }

  return {
    schema_version: 1,
    state: "published",
    edition_date: newYorkDate(now),
    published_at: now.toISOString(),
    timezone: "America/New_York",
    empty_message: "Mock mode is showing an intentionally empty edition.",
    stories: MOCK_STORIES.slice(0, count)
  };
}
