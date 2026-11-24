# Layouts — Unexuam

Unexuam is a mobile-first single-page web/Capacitor app rendered by `frontend/templates/index.html` with a persistent top bar (`.barra`), main scrollable view container (`main > section.vista`), fixed edge-to-edge bottom navigation bar (`#navbar`), emergency FAB Speed Dial (`#fab-dial`), fullscreen Mesh Chat overlay (`#chat`), fullscreen Login/Register overlay (`#v-login`), Action Sheet (`#hoja`), and Toast (`#toast`).

## Top Header (`.barra`)
- File: `frontend/templates/index.html` (lines 34–44)
- Renders: Brand logo (`logo-x.png` + `wordmark-unexuam.png`), Off-Grid live status pill (`.chip-offgrid`), and user avatar button (`#btn-cuenta`) that opens Settings.

```html
<header class="barra">
  <h1 class="sr">Unexuam · Evacuación Off-Grid para el campus UAM</h1>
  <a href="#inicio" class="marca" aria-label="Unexuam, inicio">
    <img src="/static/img/logo-x.png" alt="" class="marca-x">
    <img src="/static/img/wordmark-unexuam.png" alt="Unexuam" class="marca-unexo">
  </a>
  <span class="chip-offgrid" title="Funciona sin internet, solo con la red local">
    <span class="punto"></span> Off-Grid
  </span>
  <button type="button" id="btn-cuenta" class="avatar" aria-label="Tu cuenta" hidden></button>
</header>
```

## Bottom Navigation Bar (`#navbar`)
- File: `frontend/templates/index.html` (lines 409–435) & `frontend/static/cuenta.css`
- Renders: Fixed edge-to-edge bottom `role="tablist"` with 4 student tabs (`Inicio`, `Evacuar`, `Mensajes` + unread badge, `Ajustes`) + 5th `Admin` tab for admins, outline vs filled SVGs, safe-area inset padding, sliding pill indicator (`.nav-capsula`), and arrow-key navigation.

```html
<nav class="nav navbar" id="navbar" role="tablist" aria-label="Secciones">
  <span class="nav-capsula" aria-hidden="true"></span>
  <a href="#inicio" data-tab="inicio" role="tab" aria-selected="true" aria-controls="v-inicio" tabindex="0">...<span>Inicio</span></a>
  <a href="#campus" data-tab="campus" role="tab" aria-selected="false" aria-controls="v-campus" tabindex="-1">...<span>Evacuar</span></a>
  <a href="#mensajes" data-tab="mensajes" role="tab" aria-selected="false" aria-controls="v-mensajes" tabindex="-1">...<span>Mensajes</span><b id="badge-mensajes" class="badge" aria-live="polite" hidden></b></a>
  <a href="#ajustes" data-tab="ajustes" role="tab" aria-selected="false" aria-controls="v-ajustes" tabindex="-1">...<span>Ajustes</span></a>
  <a href="#admin" data-tab="admin" class="solo-admin" role="tab" aria-selected="false" aria-controls="v-admin" tabindex="-1" hidden>...<span>Admin</span></a>
</nav>
```

## Emergency FAB Speed Dial (`#fab-dial`)
- File: `frontend/templates/index.html` (lines 437–455) & `frontend/static/cuenta.css`
- Renders: Fixed bottom-right 56px red emergency FAB (`z-index: 15`, hidden in chat/login) expanding 3 upward mini-FABs (`Usar GPS`, `Reportar bloqueo`, `Enviar SOS`) over a blurred `#fab-scrim`.

```html
<div id="fab-scrim" class="fab-scrim" hidden></div>
<div id="fab-dial" class="fab-dial" aria-label="Acciones rápidas de emergencia">
  <div id="fab-menu" class="fab-menu" role="menu" aria-label="Opciones de emergencia" hidden>
    <button type="button" class="fab-mini-btn" role="menuitem" data-fab="gps">
      <span class="fab-lbl">Usar GPS</span><span class="fab-mini-ico azul" aria-hidden="true">...</span>
    </button>
    <button type="button" class="fab-mini-btn" role="menuitem" data-fab="bloqueo">
      <span class="fab-lbl">Reportar bloqueo</span><span class="fab-mini-ico amarillo" aria-hidden="true">...</span>
    </button>
    <button type="button" class="fab-mini-btn" role="menuitem" data-fab="sos">
      <span class="fab-lbl">Enviar SOS</span><span class="fab-mini-ico rojo" aria-hidden="true">...</span>
    </button>
  </div>
  <button type="button" id="fab-main" class="fab-main" aria-expanded="false" aria-controls="fab-menu" aria-label="Abrir acciones rápidas de emergencia">...</button>
</div>
```

## Fullscreen Overlays (`#chat`, `#v-login`, `#hoja`)
- `#chat` (`z-index: 20`): Fullscreen Mesh chat with sticky header, `role="log"` message stream, animated 3-dot DTN activity indicator, contextual quick-reply chips (`#chat-rapidos`), and multiline composer.
- `#hoja` (`z-index: 25`): Action Sheet / Modal above chat.
- `#v-login` (`z-index: 50`): Branded login & 3-step registration wizard (`Cuenta` → `Seguridad` → `Ubicación`).
