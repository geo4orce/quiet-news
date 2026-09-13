# Quiet News logo

The approved QN mark is maintained in
[`public/quiet-news.svg`](../public/quiet-news.svg). The site header and SVG
favicon use this same master. It is currently deployed on DEV only.

The open circular Q is dominant. A smaller, straight N forms its tail, with
clear separation between the letters. Both strokes are 8.5 SVG units thick,
with rounded ends and joins. Preserve the paths, spacing and proportions when
reusing the mark; do not redraw the N with a font or close the Q's opening.

- Primary color: Quiet News teal, `#147d76`, on the site's `#f4f1e9` paper.
- Monochrome use: recolor the entire mark together when needed for contrast.
- Scale uniformly. The square SVG canvas includes padding for the favicon.
- Site sizes: 42 px in the desktop header and 36 px in the mobile header.
  Favicon previews were checked at 16 and 24 px.
- Preserve separation from neighboring text and graphics. The site uses a
  12 px wordmark gap on desktop and 9 px on mobile.
- Keep the SVG as the source for any raster exports. Do not use screenshots
  or the original sketches as production assets.

When changing the master, update the asset version on both references in
`public/index.html` so browsers refresh the header image and favicon together.
