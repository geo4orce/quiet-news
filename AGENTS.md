# Quiet News agent context

Quiet News is a production static site and Git-backed daily publication. Keep
the implementation small, dependency-free, and understandable without a build
system.

## Canonical decisions

- `README.md` is the single human-facing product, contract, and operations
  document.
- `public/data` on `main` is production storage and publication history.
- The browser uses plain HTML, CSS, and JavaScript. Do not introduce a frontend
  framework, Vite, or TypeScript without a concrete need and user approval.
- GitHub Actions owns generation and receives `OPENAI_API_KEY`.
- DigitalOcean owns only static hosting. Provider facts and specs belong in
  `C:\Users\geoar\Code\infra`, not this repository.
- Production summarizes the completed previous `America/New_York` day at 4:07
  a.m., with an idempotent retry at 4:37 a.m.

## Working rules

- Read `README.md` before changing behavior or data contracts.
- Preserve unrelated local changes. Run `npm run check` before handing off.
- Tests must mock OpenAI. Do not make a live provider call unless the user
  explicitly requests it.
- Never expose or commit secrets. The ignored local `.env` may contain
  `OPENAI_API_KEY`.
- A manual edit to the current edition must keep its dated file and
  `current.json` identical. Keep `index.json` consistent with dated files.
- Keep application changes here and DigitalOcean resource decisions in the
  infra repository. Provider mutations require explicit user approval.
- Avoid using mdash characters.
