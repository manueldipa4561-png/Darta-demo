# Third-party code and assets

| Component | Version | License | Where | Integrity note |
|---|---|---|---|---|
| [anime.js](https://animejs.com) | 4.5.0 | MIT, (c) Julian Garnier | `js/vendor/anime.umd.min.js` | SHA-256 `8d5b3a58a1f64023a04a4cedeef135a2263b18da04b35177ac13438a0bad033b`, identical to `dist/bundles/anime.umd.min.js` inside the npm tarball `animejs@4.5.0` (tarball integrity verified against the registry on 2026-10-02) |
| Barlow, Barlow Condensed | Google Fonts, latin subset | SIL Open Font License 1.1, (c) Jeremy Tribby | `fonts/*.woff2` | self-hosted, no request to Google at runtime |
| Phosphor Icons (regular) | n/a | MIT | inline SVG sprite in `index.html` | paths copied into the page, no runtime dependency |

No analytics, tag managers, CDNs, web fonts or trackers are loaded. The site makes no cross-origin request at load time.

To update anime.js: download the new `dist/bundles/anime.umd.min.js` from the npm tarball (not a CDN), verify the tarball integrity against `npm view animejs@<version> dist.integrity`, replace the file, update the hash above, and re-run the site against the CSP in `netlify.toml`.
