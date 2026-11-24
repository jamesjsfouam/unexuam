# Routes — Unexuam

Unexuam uses hash-based client routing (`irA(nombre)` in `frontend/static/app.js`) served from Flask `/` (`frontend/templates/index.html`) or Capacitor offline bundle (`mobile/www/index.html`).

| Hash Route | Section ID | Layout / Shell | Summary |
|---|---|---|---|
| `#inicio` (default) | `#v-inicio` | Header + Bottom Navbar + FAB | Hero banner, calm/emergency status card, 2 primary action cards (`Evacuar`, `Mensajes`), full-width `SOS` row, Emergency Guides carousel, reorderable "Qué hacer ahora" priority list, and (admin-only) Capa 1/Capa 2 hero metrics + activity log. |
| `#campus` | `#v-campus` | Header + Bottom Navbar + FAB | Evacuation banner, classroom/building search + quick chips + GPS button + location select, 48px+ evacuation time hero + sparkline + step-by-step route list with sticky thumb-reach voice/prev/next bar, 3D building interior & 3D campus map, and (admin-only) Incidents panel (block/congestion). |
| `#mensajes` | `#v-mensajes` | Header + Bottom Navbar + FAB | Mesh network status card (`#mi-red`), search/add contact by CIF (`#form-cif`), and WhatsApp-style contact list (`#contactos`) including Canal General (`TODOS`). Tapping any contact opens fullscreen `#chat` overlay. |
| `#ajustes` | `#v-ajustes` | Header + Bottom Navbar + FAB | Hick's Law settings rendered by `frontend/static/ajustes.js`: search + recent chips, 2 quick toggles, 5 categories (`Cuenta`, `Notificaciones`, `Privacidad`, `Accesibilidad` + sub-panel `Lectura, enfoque y color`, `Ayuda`). |
| `#admin` (admin only) | `#v-admin` | Header + Bottom Navbar + FAB | 3 sub-tabs: `Grafos` (Mesh/Campus CRUD forms + adjacency list), `Dijkstra 2D` (interactive step-by-step 2D graph visualizer + frontier), and `Simulacros` (4 quick disaster drills + maintenance). |
| Overlay: `#chat` | `#chat` | Fullscreen (`body.con-chat`) | Peer or Canal General Mesh chat with DTN custody status, 3-dot activity bar, contextual quick replies (`1`–`4`), and blockage reporter. |
| Overlay: `#v-login` | `#v-login` | Fullscreen (`body.sin-sesion`) | Login + 3-step registration wizard (`1. Cuenta`, `2. Seguridad`, `3. Ubicación` with GPS) + Demo Admin button. |
