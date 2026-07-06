# World Fonts

SDF text (`@react-three/drei` `<Text>`) requires a parseable font file at a public URL —
`next/font/google` does NOT expose such a file (it inlines CSS only), so fonts are committed here.

## Committed files

| File | Weight | Size | Source |
|------|--------|------|--------|
| `EBGaramond-Regular.ttf` | Regular 400 | ~381 KB | Google Fonts gstatic CDN (v33) |
| `EBGaramond-Italic.ttf`  | Italic 400  | ~331 KB | Google Fonts gstatic CDN (v33) |
| `OFL.txt` | — | — | SIL Open Font License 1.1 |

## License

EB Garamond is released under the [SIL Open Font License 1.1](./OFL.txt).
Original designer: Georg Duffner. Maintained by Octavio Pardo + Google Fonts.

## Regenerating

If font files need to be refreshed (e.g. newer Google Fonts version), run:

```bash
# Get fresh TTF URLs from the CSS API
curl -A "Mozilla/5.0" \
  "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;1,400&display=swap"

# Then download the TTF src URLs from the CSS output, e.g.:
curl -fL "https://fonts.gstatic.com/s/ebgaramond/v33/SlGDmQSNjdsmc35JDF1K5E55YMjF_7DPuGi-6_RUAw.ttf" \
  -o EBGaramond-Regular.ttf
curl -fL "https://fonts.gstatic.com/s/ebgaramond/v33/SlGFmQSNjdsmc35JDF1K5GRwUjcdlttVFm-rI7e8QI96.ttf" \
  -o EBGaramond-Italic.ttf
```

## Why TTF, not WOFF?

Troika (the SDF text renderer behind drei `<Text>`) parses font binaries via
opentype.js, which supports TTF/OTF natively. WOFF2 requires decompression.
TTF is the safest choice for this use case.

## Usage in code

See `apps/web/components/world/text/fonts.ts` for the URL constants and
`preloadWorldFonts()` helper consumed by `WorldCanvas`.
