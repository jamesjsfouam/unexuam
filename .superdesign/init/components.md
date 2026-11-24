# Components — Unexuam

- **Framework:** Flask SSR + Vanilla HTML/CSS/JS SPA (Capacitor Android wrapper in `mobile/`)
- **Styling:** Vanilla CSS (`frontend/static/app.css`, `frontend/static/cuenta.css`), pill radius `30px`, UNEXO palette (`#0080ff`, `#0062cc`, `#e23000`, `#fcd222`, `#00d656`)
- **Shared UI Primitives:** Defined as reusable HTML/CSS patterns in `frontend/templates/index.html`, `frontend/static/app.css`, `frontend/static/cuenta.css`, plus standalone vanilla JS modules `frontend/static/ajustes.js` and `frontend/static/lista-ordenable.js`.

## Button (`.btn`, `.fila-figma`, `.tarjeta-figma`)
- File: `frontend/static/app.css` & `frontend/static/cuenta.css`
- Description: Pill-shaped buttons with WCAG >= 4.5:1 contrast, primary/secondary/danger/warning/mini/round variants, plus Figma-derived emergency cards and rows.
- Key classes/variants: `.btn.primario`, `.btn.secundario`, `.btn.peligro`, `.btn.alerta`, `.btn.aviso-btn`, `.btn.seguro`, `.btn.mini`, `.btn.redondo`, `.btn.ancho`, `.btn.grande`, `.tarjeta-figma.{azul|verde|rojo|amarillo}`, `.fila-figma.{azul|rojo|amarillo}`.

```css
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 44px;
  min-width: 44px;
  padding: 8px 18px;
  border-radius: 999px;
  border: 2.5px solid var(--azul-btn);
  font: 800 0.9375rem var(--fuente);
  cursor: pointer;
  text-decoration: none;
  background: var(--blanco);
  color: var(--azul-btn);
  box-shadow: 0 2px 6px rgba(11, 42, 74, .12);
  transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
}
.btn.primario {
  min-height: 48px;
  background: var(--azul-btn);
  border-color: var(--azul-btn);
  color: var(--blanco);
  box-shadow: 0 6px 16px rgba(0, 98, 204, .3);
}
.btn.peligro, .btn.alerta {
  min-height: 48px;
  background: var(--rojo);
  border-color: var(--rojo);
  color: var(--blanco);
}
.btn.aviso-btn {
  min-height: 48px;
  background: var(--amarillo);
  border-color: var(--amarillo-txt);
  color: var(--texto);
}
.btn:disabled {
  opacity: .48;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}
```

## Form Fields (6 distinct input types)
- File: `frontend/static/app.css`
- Description: Distinctly styled Text/Search, Textarea (`resize: vertical`), Select (chevron), Checkbox (square), Radio (circle), and Range slider.

```css
.campo { display: flex; flex-direction: column; gap: 5px; min-width: 0; flex: 1; }
.campo > span { font-size: 0.8125rem; color: var(--azul-osc); padding-left: 12px; }
select, textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]) {
  width: 100%; min-height: 46px; padding: 10px 16px; font: 700 1rem var(--fuente);
  color: var(--texto); background: var(--blanco); border: 2.5px solid var(--azul-osc);
  border-radius: var(--radio); appearance: none; -webkit-appearance: none;
}
textarea { min-height: 76px; border-radius: 18px; resize: vertical; }
input[type="checkbox"] { width: 22px; height: 22px; border-radius: 4px; accent-color: var(--azul-btn); }
input[type="radio"] { width: 22px; height: 22px; border-radius: 50%; accent-color: var(--azul-btn); }
input[type="range"] { width: 100%; min-height: 32px; accent-color: var(--azul-btn); }
```

## Segmented Control & Chips (`.segmentado`, `.chips`)
- File: `frontend/static/app.css`
- Description: Pill tablist switcher and quick-select chips.

```css
.segmentado { display: flex; border: 2.5px solid var(--azul-btn); border-radius: var(--radio); padding: 3px; gap: 4px; background: var(--blanco); }
.segmentado button { flex: 1; min-height: 38px; border: 0; border-radius: var(--radio); background: transparent; font: 700 0.875rem var(--fuente); color: var(--azul-btn); cursor: pointer; }
.segmentado button[aria-selected="true"] { background: var(--azul-btn); color: var(--blanco); }
.chips { display: flex; gap: 10px; flex-wrap: wrap; }
.chips button { min-height: 40px; padding: 6px 14px; border-radius: var(--radio); border: 2.5px solid var(--amarillo-txt); background: var(--blanco); color: var(--texto); font: 700 0.9375rem var(--fuente); }
```

## Action Sheet (`#hoja`)
- File: `frontend/templates/index.html` & `frontend/static/app.css`
- Description: Bottom sheet on mobile (`z-index: 25`, blur backdrop, swipe-down dismiss, pinned Cancel footer, max 5 actions + "Más opciones…") and centered modal on desktop (`>= 768px`).

```html
<div id="hoja" class="hoja" hidden>
  <div class="hoja-fondo" data-cerrar></div>
  <div class="hoja-carta" role="dialog" aria-modal="true" aria-labelledby="hoja-titulo" aria-describedby="hoja-texto">
    <div class="hoja-asa" aria-hidden="true"></div>
    <div class="hoja-cuerpo">
      <h3 id="hoja-titulo"></h3>
      <p id="hoja-texto" class="nota"></p>
      <div id="hoja-acciones" class="hoja-acciones"></div>
    </div>
    <div class="hoja-pie">
      <button type="button" class="btn secundario ancho hoja-cancelar" data-cerrar>Cancelar</button>
    </div>
  </div>
</div>
```

## Metric Hero Card & Sparkline (`.metrica-hero`, `.metricas-sec`, `.metrica-det`)
- File: `frontend/static/app.css` & `frontend/templates/index.html`
- Description: 48px+ primary hero metric with brand color, inline SVG sparkline, neutral supporting cards, and `<details>` technical breakdown.

```html
<div class="metrica-hero">
  <div class="metrica-hero-val"><b id="c-tie">34 s</b><span>tu ruta</span></div>
  <div class="metrica-spark" id="spark-campus"></div>
</div>
<div class="metricas metricas-sec">
  <div><b id="c-lug">154</b><span>lugares</span></div>
  <div><b id="c-pas">442</b><span>pasos</span></div>
  <div><b id="c-zon">4</b><span>zonas seguras</span></div>
</div>
<details class="metrica-det">
  <summary>Detalles técnicos</summary>
  <p class="nota" id="c-nota"></p>
</details>
```

## Reorderable List (`lista-ordenable.js`)
- File: `frontend/static/lista-ordenable.js`
- Description: Drag-and-drop + keyboard (`ArrowUp`/`ArrowDown`) reorderable list with always-visible 6-dot grip handle and FLIP slide animation.

## Accessibility & Settings Panel (`ajustes.js`)
- File: `frontend/static/ajustes.js`
- Description: Hick's Law settings view (`<= 7` options/screen), search + recent chips, `role="switch"` toggles, 100%–200% text scale slider with live preview, 3-level contrast radio, dyslexia font, line-height slider, focus mode, and SVG colorblindness filters.
