# Bundled Fonts

Drop the variable font files here to ship the exact WaveEdit typography
offline (no CDN required):

- `Inter-Variable.woff2`
- `JetBrainsMono-Variable.woff2`

Then uncomment the matching `@font-face` rules in
[`src/styles/fonts.css`](../../styles/fonts.css).

Until the files are present, the app falls back to the system UI font and a
monospace font, so it works fully offline either way.
