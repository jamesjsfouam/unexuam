# Pages — Dependency Trees

All views are hosted inside `frontend/templates/index.html` and styled by `frontend/static/app.css` + `frontend/static/cuenta.css`.

## #inicio (Home / Emergency Hub)
Entry: `frontend/templates/index.html:48:170`
Dependencies:
- `frontend/static/app.css:28:110` (tokens & typography)
- `frontend/static/cuenta.css:24:180` (navbar, FAB speed dial)
- `frontend/static/cuenta.css:402:560` (Figma cards, rows, carrusel)
- `frontend/static/app.js:462:545` (`renderInicio`, sparklines)
- `frontend/static/lista-ordenable.js` (reorderable `#lista-prioridad`)
- `frontend/static/img/logo-x.png`, `frontend/static/img/wordmark-unexuam.png`, `frontend/static/img/mapa-campus-3d.svg`

## #campus (Evacuar — 3D Map & Route Guidance)
Entry: `frontend/templates/index.html:171:275`
Dependencies:
- `frontend/static/app.css:581:840` (forms, buttons, chips)
- `frontend/static/app.css:1677:1774` (hero metrics & sparklines)
- `frontend/static/app.js:840:920` (`renderRuta`, voice controls)
- `frontend/static/ubicacion.js` (GPS campus polygon/building resolver)
- `frontend/static/campus-plano.json`

## #mensajes & #chat (Offline Mesh Messaging)
Entry: `frontend/templates/index.html:394:495`
Dependencies:
- `frontend/static/cuenta.css:260:420` (contacts list, fullscreen chat, 3-dot activity, quick replies)
- `frontend/static/cuenta.js:495:660` (`renderMensajes`, `renderChat`, `sugerenciasContextuales`, `enviar`)

## #ajustes (Settings & Accessibility Preferences)
Entry: `frontend/templates/index.html:405` (`#v-ajustes`)
Dependencies:
- `frontend/static/ajustes.js` (full UI & state)
- `frontend/static/cuenta.css:741:890` (settings cards, switches, radios, sliders, contrast/colorblind filters)

## #admin (Graph CRUD, Dijkstra 2D, Drills)
Entry: `frontend/templates/index.html:276:393`
Dependencies:
- `frontend/static/app.css:581:840` (forms, buttons, segmented tabs)
- `frontend/static/cuenta.css:400:460` (Dijkstra 2D SVG styles)
- `frontend/static/app.js:1648:1720` (CRUD handlers + confirmations)
- `frontend/static/cuenta.js:660:860` (Dijkstra 2D step-by-step player)

## #v-login (Login & 3-Step Registration Wizard)
Entry: `frontend/templates/index.html:496:565`
Dependencies:
- `frontend/static/cuenta.css:210:280` (login card, brand graph backdrop, 3-step wizard stepper)
- `frontend/static/cuenta.js:177:395` (`actualizarWizard`, `entrar`, GPS location step)
