# Slice

A p5.js tool that slices a letter, word or image across a grid of cells (square, circle, triangle, pentagon, hexagon or octagon), then distorts, animates and exports it.

**Features:** text or image content, six cell shapes with interlocking layouts, fonts, solid or gradient font and background colors, grid lines, grid shift, squeeze, compression X/Y, rotation, seeded random motion with stagger ripple and random rotation, pointer magnify, PNG export and seamless-loop MP4 export (1080p, 2K, 4K, landscape or portrait).

## Run it

It is a static site with no build step.

- **Locally:** open `index.html` in a browser (or run `python3 -m http.server` in this folder).
- **GitHub Pages:** push these files to a repository, then go to **Settings > Pages**, choose **Deploy from a branch**, pick `main` and `/ (root)`, and save. The site appears at `https://<your-username>.github.io/<repo-name>/`.

## Files

- `index.html` - page shell and the control panel
- `style.css` - styles (light and dark mode follow the system)
- `slice.js` - the engine, panel logic and export

## Notes

- Libraries load from CDNs at pinned versions: p5.js 1.9.4 (cdnjs) and mp4-muxer 5.2.2 (jsDelivr). Fonts load from Google Fonts. An internet connection is needed on first load.
- MP4 export uses the browser's WebCodecs video encoder: recent Chrome, Edge or Safari. 4K needs a machine with enough memory.
- Controls: **H** hides the panel. Double-click a label to reset that control.

## Credits

Concept inspired by a p5.js pattern sketch at junimagelab.github.io/pattern. The code in this repository was written from scratch. Add a license of your choice before publishing.
