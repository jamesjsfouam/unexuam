# Theme & Design Tokens — Unexuam

## Part 1 — Compact Token Summary

- **Brand:** UNEXO / Unexuam (UAM Campus Off-Grid Evacuation & Mesh Messaging)
- **Color Palette (Light Mode + WCAG >= 4.5:1 Accessible Interactive Tokens):**
  - `--azul`: `#0080ff` (brand blue, banners, decorative accents)
  - `--azul-osc`: `#0066cc` (dark brand blue, borders, headings)
  - `--azul-btn`: `#0062cc` (WCAG 5.9:1 primary CTA & active tab blue)
  - `--azul-claro`: `#e6f2ff` (soft blue surface / hero tint)
  - `--rojo`: `#d92b00` (emergency / SOS / destructive red)
  - `--rojo-claro`: `#fdebe6` (soft red surface)
  - `--verde`: `#00d656` (brand bright green / online dot)
  - `--verde-osc` / `--verde-btn`: `#00702e` (WCAG 5.9:1 safe-zone / primary green)
  - `--amarillo`: `#fcd222` (warning yellow; always pair with `--texto` `#0b2a4a` for 8.4:1 contrast)
  - `--amarillo-txt`: `#7a5c00` (WCAG 5.9:1 amber text on white)
  - `--amarillo-claro`: `#fff7d6` (soft yellow surface)
  - `--blanco`: `#ffffff` (card surface)
  - `body` background: `#f4f8ff` (cool off-white canvas)
  - `--gris-claro`: `#eef2f7` (neutral supporting surfaces & dividers)
  - `--gris` / `--gris-texto`: `#526275` (WCAG 6.07:1 muted text)
  - `--texto`: `#0b2a4a` (deep navy primary text & high-contrast focus ring)
  - `--arista`: `#9fbde0` (graph edge / subtle border)
- **Typography:**
  - `--fuente`: `"UnexoNexa", "Nexa", "Montserrat", "Poppins", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif` (offline bundled `Montserrat-Regular/Bold/Black.ttf`)
  - Base size: `16px * var(--escala-texto, 1)` (supports `100%–200%` user scaling)
  - Line height: `var(--interlineado, 1.4)` (supports `1.4–2.0`)
  - Hero metrics: `clamp(2.85rem, 11vw, 3.4rem)`, weight `900`, `tabular-nums`
- **Radii & Elevation:**
  - `--radio`: `30px` (signature UNEXO pill radius; `999px` for buttons/rows/badges; `20px–26px` for cards/modals)
  - Focus ring: `3px solid #0b2a4a` + `0 0 0 5px #ffffff` dual ring
  - Soft blue-tinted shadows: `0 6px 16px rgba(0, 98, 204, .28)` / `0 8px 18px rgba(0, 60, 130, .22)`
- **Layout & Z-Index Stack:**
  - `--alto-nav`: `72px`
  - Breakpoints: `420px` (wizard stepper horizontal), `720px` (settings 2-col grid / mobile thumb dock), `768px` (Action Sheet → centered modal)
  - Z-index: `.cta-pulgar: 6`, `.navbar: 8`, `.fab-scrim: 14`, `.fab-dial: 15`, `.chat: 20`, `.hoja: 25`, `.toast: 30`, `.drag-item.arrastrando: 45`, `.login: 50`, `.splash: 99`
- **Accessibility Modes:**
  - `html[data-contraste="aumentado" | "alto"]`
  - `body.aj-dislexia`, `body.aj-enfoque`, `body.aj-sin-anim`
  - `html[data-filtro-color="protanopia" | "deuteranopia" | "tritanopia" | "acromatopsia"]`

## Part 2 — Raw `:root` & Core Variable Source

File: `frontend/static/app.css` (lines 7–68)
```css
@font-face {
  font-family: "UnexoNexa";
  font-weight: 400;
  font-display: swap;
  src: url("/static/fonts/Montserrat-Regular.ttf") format("truetype");
}
@font-face {
  font-family: "UnexoNexa";
  font-weight: 700;
  font-display: swap;
  src: url("/static/fonts/Montserrat-Bold.ttf") format("truetype");
}
@font-face {
  font-family: "UnexoNexa";
  font-weight: 900;
  font-display: swap;
  src: url("/static/fonts/Montserrat-Black.ttf") format("truetype");
}

:root {
  --azul: #0080ff;
  --azul-osc: #0066cc;
  --azul-btn: #0062cc;
  --azul-claro: #e6f2ff;
  --rojo: #d92b00;
  --rojo-claro: #fdebe6;
  --verde: #00d656;
  --verde-osc: #00702e;
  --verde-btn: #00702e;
  --amarillo: #fcd222;
  --amarillo-txt: #7a5c00;
  --amarillo-claro: #fff7d6;
  --blanco: #ffffff;
  --gris: #526275;
  --gris-texto: #526275;
  --gris-claro: #eef2f7;
  --texto: #0b2a4a;
  --arista: #9fbde0;
  --radio: 30px;
  --escala-texto: 1;
  --interlineado: 1.4;
  --foco-anillo: 0 0 0 5px #ffffff;
  --fuente: "UnexoNexa", "Nexa", "Montserrat", "Poppins", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif;
  color-scheme: light;
}
```
