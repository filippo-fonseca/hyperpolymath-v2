# World HDRI

## Current status: use drei `<Environment preset="night">`

U-08 (atmosphere-post) defaults to `<Environment preset="night">` (built-in,
zero file required). This is the recommended path for MVP.

The HDR file below is **optional** — drop it in to override the preset
with a higher-quality custom HDRI:

## Optional: custom night HDRI

| Target filename | `night-256.hdr` |
|-----------------|-----------------|
| Max size | ≤ 1.5 MB |
| Resolution | 1k downsampled to 256 px via `drei` `resolution={256}` |
| License | CC0 (public domain) |

### Recommended source

**Poly Haven** — [https://polyhaven.com/hdris?c=outdoor&t=night](https://polyhaven.com/hdris?c=outdoor&t=night)

Good candidates:
- `moonless_golf_1k.hdr` — [https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/moonless_golf_1k.hdr](https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/moonless_golf_1k.hdr)
- `dikhololo_night_1k.hdr` — [https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/dikhololo_night_1k.hdr](https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/dikhololo_night_1k.hdr)

Download any of the above, rename to `night-256.hdr`, and place it here.

### Usage in U-08 (`Atmosphere.tsx`)

```tsx
// Default (no file needed):
<Environment preset="night" background={false} />

// With custom HDRI (after dropping the file here):
<Environment files="/world/hdri/night-256.hdr" resolution={256} background={false} />
```

> **Note for U-08 executor:** default to `preset="night"`. Only switch to
> `files=` if the file exists AND looks better in testing.
