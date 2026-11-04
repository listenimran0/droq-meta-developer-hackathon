# DROQ — motion piece

A Remotion rebuild of the DROQ journey, made from the app's **real screens**.

The app is React Native; Remotion renders the DOM. So the scenes are not
screenshots — they are the same layouts, type scale, palette and copy rebuilt
in DOM, with the app's motion (the `ProximityPulse` breath, the `AmbientBackground`
drift, the entrance fades) re-implemented frame-by-frame.

## The journey

| # | Scene | Frames | Built from |
|---|---|---|---|
| 1 | *The opposite of scrolling* | 0–200 | `app/onboarding.tsx` |
| 2 | *Your feet are the password* | 200–360 | `app/onboarding.tsx` |
| 3 | The quiet city, then the signal | 360–570 | `app/(tabs)/home.tsx` |
| 4 | The walk (304m → 88m) | 570–900 | `app/(tabs)/home.tsx` |
| 5 | In range (88m → 8m) | 900–1000 | `app/(tabs)/home.tsx` |
| 6 | It opens | 1000–1210 | `app/drop/found.tsx` + `app/drop/[id].tsx` |
| 7 | Plant one | 1210–1400 | `app/create/index.tsx` (step 3) |
| 8 | It is out there | 1400–1560 | `app/create/preview.tsx` |
| 9 | Leave. Walk. Unlock. | 1560–1800 | brand |

Output: 1080×1920, 30fps, 60s — cut for Reels / TikTok / Shorts.

## How the real app is reused

| Piece | Source | How it is carried over |
|---|---|---|
| Palette | `constants/theme.ts` → `src/theme.ts` | copied verbatim (`darkColors`) |
| Type | `@expo-google-fonts/syne` + `dm-sans` | the real `.ttf` files, imported from `src/assets` |
| Brand mark | `assets/droq-brand-mark-transparent.png` | same file |
| Proximity pulse | `components/discover/ProximityPulse.tsx` | same geometry (stage 168 / wash 148 / outer 148 / ring 104 / core 40) and the same 1.6s + 2.2s breath |
| Atmosphere | `components/ui/AmbientBackground.tsx` | same orbs (340 brass, 320 mist), same 18s drift + 8.4s breathe |
| Copy | the app's own strings | word for word, including "Quiet city. Something may still be waiting out there.", "GPS accuracy ±4m — clear enough to leave." |
| Buttons | `components/ui/Button.tsx` | same radius, tracking, colours |

## Commands

```bash
npm i                 # install
npm run studio        # preview + scrub the timeline at localhost:3000
npm run render        # write out/droq-journey.mp4
npm run still         # one frame, for quick checks
```

## Two gotchas worth knowing

1. **`borderStyle` defaults to `none` in CSS.** React Native has no
   `border-style` concept, so `borderWidth` alone draws a border there — in the
   DOM it draws nothing. Every border in this project sets
   `borderStyle: 'solid'` explicitly.

2. **Display type needs a pinned box.** The web engine gives Syne a very tall
   natural line box, which throws the layout off (headlines vanish or push
   their neighbours down). `src/components/ui.tsx` exports a `<Display>` wrapper
   that fixes the height and centres the glyphs — use it for any type ≥ 34px.

## Rendering on this machine

The bundled `chrome-headless-shell` dies here ("GPU process isn't usable"), so
`remotion.config.ts` points at the locally installed Chrome and renders with
software rasterisation:

```ts
Config.setBrowserExecutable('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
Config.setChromiumOpenGlRenderer('swangle');
```
