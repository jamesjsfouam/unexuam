# Extractable Components — Unexuam

## Layout Components

### TopHeader
- Source: `frontend/templates/index.html:34:44`
- Category: layout
- Description: Fixed brand header with UNEXO X logo, Unexuam wordmark, Off-Grid live status chip, and circular user avatar button.
- Extractable props: `userInitials` (string, default: `"JR"`), `isOffGrid` (boolean, default: `true`), `showAvatar` (boolean, default: `true`)
- Hardcoded: Brand logo URL (from Brand Assets), wordmark, Off-Grid dot & label, header styling.

### BottomNavBar
- Source: `frontend/templates/index.html:409:435`
- Category: layout
- Description: Edge-to-edge fixed bottom tablist with outline/filled icons, unread Messages badge, and optional Admin tab.
- Extractable props: `activeTab` (string, default: `"inicio"`), `unreadCount` (number, default: `0`), `isAdmin` (boolean, default: `false`)
- Hardcoded: Tab labels (`Inicio`, `Evacuar`, `Mensajes`, `Ajustes`, `Admin`), SVG icons, safe-area inset styling.

### EmergencyFabDial
- Source: `frontend/templates/index.html:437:455`
- Category: layout
- Description: Bottom-right 56px red emergency FAB expanding upward into 3 mini-FABs (`Usar GPS`, `Reportar bloqueo`, `Enviar SOS`).
- Extractable props: `isOpen` (boolean, default: `false`)
- Hardcoded: Action labels, icon SVGs, UNEXO emergency colors (`#d92b00`, `#fcd222`, `#0062cc`).

## Basic Components

### ActionSheet
- Source: `frontend/templates/index.html:533:548`
- Category: basic
- Description: Bottom Action Sheet on mobile / centered modal on desktop with drag handle, scrollable body, danger separator, and pinned Cancel footer.
- Extractable props: `title` (string, default: `"Opciones"`), `subtitle` (string, default: `""`), `isOpen` (boolean, default: `true`)
- Hardcoded: Backdrop blur, handle bar, Cancel button styling.

### EmergencyStatusHero
- Source: `frontend/templates/index.html:67:73`
- Category: basic
- Description: Status banner pill switching between Calm (`calma`) and Active Emergency (`emergencia`) states.
- Extractable props: `state` (string, default: `"calma"`), `title` (string, default: `"Todo en calma"`), `subtitle` (string, default: `"Sin alertas activas."`)
- Hardcoded: Card radius, icon slot, status color tokens.

### MetricHeroCard
- Source: `frontend/templates/index.html:121:168`
- Category: basic
- Description: Dashboard card with 48px+ primary hero metric, inline SVG sparkline, neutral secondary metrics, and collapsible technical details.
- Extractable props: `title` (string, default: `"Capa 2 · Campus"`), `primaryValue` (string, default: `"34 s"`), `primaryLabel` (string, default: `"tu ruta"`)
- Hardcoded: Visual hierarchy classes (`.metrica-hero`, `.metricas-sec`, `.metrica-det`), sparkline dimensions.
