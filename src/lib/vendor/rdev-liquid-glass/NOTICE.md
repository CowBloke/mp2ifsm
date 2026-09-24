# Liquid Glass third-party source

This directory uses the MIT-licensed optical implementation from [rdev/liquid-glass-react](https://github.com/rdev/liquid-glass-react), a project with 6,230 GitHub stars at the time of integration (23 September 2026).

- Upstream version: `1.1.1`
- Pinned commit: `ac48eab18d1f7f444ae30002d240cae29c863a21`
- `shader-utils.ts`: copied byte-for-byte from upstream `src/shader-utils.ts`.
- `RdevGlassFilter.tsx`: extracted from upstream `GlassFilter` in `src/index.tsx`.
- `LICENSE`: complete upstream MIT license, copyright Max Rovensky.
- `LICENSE.shuding`: MIT license for Shu Ding's [original displacement shader](https://github.com/shuding/liquid-glass), which is credited by upstream `shader-utils.ts`.

The upstream source files and license were verified against their Git blob hashes at the pinned commit before extraction.

The extracted filter retains the upstream RGB displacement passes, edge mask, channel blending, and clean-center compositing. It is restricted to shader mode, accepts its generated map directly, gives its map a unique ID, and renders a zero-size SVG host. The upstream container, fixed centering, mouse elasticity, and bundled static images are omitted so the site's navigation keeps its own layout. Maps are upstream PNG data URLs, compatible with the existing `img-src 'self' data:` deployment policy.

`runtime.ts` and `use-rdev-glass.ts` are application integration code: SSR-safe capability checks, live accessibility and Save-Data preferences, idle-time map generation with bounded resolution, responsive resizing, and cleanup. They are not copied from another Liquid Glass library.

Chromium renders the SVG refraction. Safari, iOS and Firefox use the site's CSS fallback; reduced transparency, higher contrast, reduced motion and Save-Data disable the optical filter. The application owns CSS styling.
