# Walkthrough: UI/UX, Theming & Performance Optimization

## Übersicht der umgesetzten Optimierungen

Die identifizierten Schwachstellen in den Bereichen **WebGL-Ressourcenverbrauch**, **Leerlauf-Rendering-Schleifen**, **Layout Thrashing**, **Theming-FOUC** und **DOM-Mutationen** wurden vollständig behoben.

---

## Detaillierte Änderungen

### 1. WebGL-Ressourceneinsparung (`FireOverlay`)
- **Datei:** [`src/routes/+layout.svelte`](../../src/routes/+layout.svelte)
- **Änderung:** Die drei Schichten von `FireOverlay` (`tiles`, `windows`, `modals`) werden jetzt reaktiv nur dann gemountet, wenn `settingsState.enableBurningBorders === true` ist.
- **Ergebnis:** Im Normalbetrieb werden 3 ungenutzte Three.js `WebGLRenderer`-Instanzen, WebGL-Kontexte und Shader-Buffer eingespart.

### 2. Beseitigung der Leerlauf-Last & des Layout Thrashings (`FXOverlay` & `DuckLogic`)
- **Dateien:** [`src/components/shared/FXOverlay.svelte`](../../src/components/shared/FXOverlay.svelte), [`src/lib/pets/DuckLogic.ts`](../../src/lib/pets/DuckLogic.ts)
- **Änderung:**
  1. `DuckLogic.isActive()` unterscheidet nun aktive Aktionen von Idle/Schlaf. Die 60/120 FPS `requestAnimationFrame`-Schleife in `FXOverlay` wird im Ruhezustand gestoppt und wacht erst bei Events (Klick, Duck-Aktion, Projektil, Smash) dynamisch auf.
  2. `checkWindowImpact()` führt keine teuren `querySelectorAll` + `getBoundingClientRect()` + `el.style.transform` mehr pro Animationsframe aus, sondern nutzt gecachte Bounds (`cacheWindowBounds()` bei Start des Flugs).

### 3. Nahtlose View Transitions & Scoped Theme Fallbacks (`themes.css` & `ui.svelte.ts`)
- **Dateien:** [`src/themes.css`](../../src/themes.css), [`src/stores/ui.svelte.ts`](../../src/stores/ui.svelte.ts)
- **Änderung:**
  1. Direkte Unterstützung der nativen `document.startViewTransition()` API für ruckelfreies Theming.
  2. Der universelle `*`-Selektor wurde durch gezielt ausgewählte Selektoren (`.app-container`, `.window-frame`, `.glass-panel`, Buttons, Inputs) ersetzt, um Massen-Recalculations auf tausenden DOM-Knoten zu vermeiden.
  3. `prefers-reduced-motion: reduce` schaltet Transitionen automatisch ab.

### 4. Beseitigung von FOUC beim Theme-Reload (`app.html` & `ui.svelte.ts`)
- **Dateien:** [`src/app.html`](../../src/app.html), [`src/stores/ui.svelte.ts`](../../src/stores/ui.svelte.ts)
- **Änderung:** Die `bgColors`-Tabelle im Inline-Head-Script wurde um alle 28 Themes (inkl. `catppuccin`, `one-dark-pro`, `obsidian`, `dracula-soft`, `github-dark`, `github-light`, `ayu-dark`, `ayu-light`, `ayu-mirage`, `midnight`, `cobalt2`, `night-owl`, `insight`, `ever`) erweitert.
- **Ergebnis:** Kein Flackern auf Standard-Hintergründe mehr beim Reload.

### 5. DOM-freie Farbwert-Auflösung (`AmbientTopline` & `CandlestickChart`)
- **Dateien:** [`src/components/shared/AmbientTopline.svelte`](../../src/components/shared/AmbientTopline.svelte), [`src/components/shared/CandlestickChart.svelte`](../../src/components/shared/CandlestickChart.svelte)
- **Änderung:** Das Erzeugen, Anhängen und Entfernen temporärer `<div>`-Tags in `document.body` während der Renderzyklen wurde durch direktes bzw. rekursives Auslesen von `getComputedStyle(document.documentElement)` ersetzt.

### 6. Deterministische Partikel-Generierung (`BackgroundAnimations`)
- **Datei:** [`src/components/shared/BackgroundAnimations.svelte`](../../src/components/shared/BackgroundAnimations.svelte)
- **Änderung:** Statt `Math.random()` im Template-Renderloop werden Partikel nun deterministisch über ein `$derived`-Array mit statischen Delays und X-Offsets berechnet und mit `(p.id)` keyed.

---

## Verifikationsergebnisse

- **Git Status:** Sauberer Commit-Verlauf auf dem Branch `perf/ui-ux-theming-optimization-v2`.
- **Theming:** Alle 28 Themes schalten ohne Ruckler um und laden ohne FOUC.
- **Ressourcen:** 3 WebGL-Kontexte im Ruhezustand eingespart, FX-Animationsschleife stoppt zuverlässig bei Inaktivität.
