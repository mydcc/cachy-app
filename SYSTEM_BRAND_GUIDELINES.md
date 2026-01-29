# C A C H Y - System Brand Guidelines

**Design System für Svelte 5 + Tailwind CSS v4**  
*Version 1.0 - Januar 2026*

---

## 📋 Inhaltsverzeichnis

1. [Einleitung & Philosophie](#einleitung--philosophie)
2. [4-Theme System](#4-theme-system)
3. [Farbpalette](#farbpalette)
4. [Typografie](#typografie)
5. [Spacing & Layout](#spacing--layout)
6. [Komponenten](#komponenten)
7. [Icons & Grafische Elemente](#icons--grafische-elemente)
8. [Animation & Transitions](#animation--transitions)
9. [Implementierung in Svelte 5](#implementierung-in-svelte-5)
10. [Accessibility](#accessibility)

---

## 🎯 Einleitung & Philosophie

### Vision


### Grundprinzipien

1. **Konsistenz**: Einheitliche Komponenten über alle Themes
2. **Performance**: Optimiert für Core Web Vitals
3. **Accessibility**: WCAG 2.1 AA konform
4. **Modularität**: Wiederverwendbare Svelte 5 Components
5. **Skalierbarkeit**: CSS-Variablen ermöglichen Theme-Switching

---

## 🌈 XXXX NEUES CACHY Theme System

### Theme 1: **METEORITE** (Purple) - Default/Blog/Generic

**Verwendung:** Blog, generische Content-Pages, Hauptnavigation

```css
/* Core Brand Colors */
--core-primary: #4e21e7;      /* Purple */
--core-base: #433f65;          /* Meteorite */

/* Dark Mode */
--clr-dark: #0c082f;           /* Purple Dark */
--clr-light: #ede8fd;          /* Purple Light */

/* Gradient */
--grad-light: #2b1f99;
--grad-dark: #0c082f;

/* Semantic Mapping */
--bg-body: radial-gradient(farthest-side at top, var(--grad-light), var(--grad-dark));
--text-main: #ede8fd;
--text-muted: #c2befa;
--color-accent: #4e21e7;
```

**Einsatzbereiche:**

- Hauptseite (Homepage)
- Blog-Übersicht & Artikel
- About-Seite
- Standard Content-Pages

---

### Theme 2: **STEEL** (Blue) - Professional/Services/Pro

**Verwendung:** Service-Pages, B2B-Angebote, XR Studio

```css
/* Core Brand Colors */
--core-primary: #334eff;       /* Blue PRO */
--core-base: #433f65;

/* Dark Mode */
--clr-dark: #08103f;           /* Blue PRO Dark */
--clr-light: #eaedff;          /* Blue PRO Light */

/* Gradient */
--grad-light: #3c6e99;
--grad-dark: #08103f;

/* Semantic Mapping */
--bg-body: radial-gradient(farthest-side at top, var(--grad-light), var(--grad-dark));
--text-main: #eaedff;
--text-muted: #80b8f2;
--color-accent: #334eff;
```

**Einsatzbereiche:**

- `/services` - Service-Übersicht
- `/xr-studio` - XR/AR/VR Showcase
- `/solutions` - Business Solutions
- Professional Landing Pages

---

### Theme 3: **EVER** (Green) - Community/Growth/Free

**Verwendung:** Community-Features, Free-Angebote, Open-Source Projekte

```css
/* Core Brand Colors */
--core-primary: #0da49a;       /* Green Free */
--core-base: #433f65;

/* Dark Mode */
--clr-dark: #002039;           /* Green Free Dark */
--clr-light: #e6f6f5;          /* Green Free Light */

/* Gradient */
--grad-light: #3c8499;
--grad-dark: #002039;

/* Semantic Mapping */
--bg-body: radial-gradient(farthest-side at top, var(--grad-light), var(--grad-dark));
--text-main: #e6f6f5;
--text-muted: #48b0b2;
--color-accent: #0da49a;
```

**Einsatzbereiche:**

- `/offer/free-ebook`
- Community Pages
- Open-Source Projekte (z.B. `/work/n8n-nodes`)
- Kostenlose Tools

---

### Theme 4: **INSIGHT** (Red) - Offers/Conversion/Special

**Verwendung:** Special Deals, High-Conversion Landing Pages, Angebote

```css
/* Core Brand Colors */
--core-primary: #ee485f;       /* Red Insights */
--core-base: #433f65;

/* Dark Mode */
--clr-dark: #0f0523;           /* Red Insights Dark */
--clr-light: #feecef;          /* Red Insights Light */

/* Gradient */
--grad-light: #6d2954;
--grad-dark: #0f0523;

/* Semantic Mapping */
--bg-body: radial-gradient(farthest-side at top, var(--grad-light), var(--grad-dark));
--text-main: #feecef;
--text-muted: #fa9de7;
--color-accent: #ee485f;
```

**Einsatzbereiche:**

- `/offer/special-deal`
- High-Converting Landing Pages
- Call-to-Action Heavy Pages
- Time-Limited Offers

---

## 🎨 Farbpalette

### Core Colors (Alle Themes)

| Farbe | Hex | RGB | Verwendung |
|-------|-----|-----|-----------|
| **Purple** | `#4e21e7` | 78, 33, 231 | Meteorite Theme Primary |
| **Meteorite** | `#433f65` | 67, 63, 101 | Base Color (alle Themes) |
| **Green Free** | `#0da49a` | 13, 164, 154 | Ever Theme Primary |
| **Blue PRO** | `#334eff` | 51, 78, 255 | Steel Theme Primary |
| **Red Insights** | `#ee485f` | 238, 72, 95 | Insight Theme Primary |
| **White** | `#ffffff` | 255, 255, 255 | Text auf dunklen BGs |

### Highlighting Colors

| Farbe | Hex | RGB | Verwendung |
|-------|-----|-----|-----------|
| **Purple Highlight** | `#7383f5` | 115, 131, 245 | Links, Hover States (Meteorite) |
| **Purple Alt** | `#c2befa` | 194, 190, 250 | Muted Text (Meteorite) |
| **Green Highlight** | `#48b0b2` | 72, 176, 130 | Links (Ever) |
| **Green Alt** | `#7fb5a8` | 127, 181, 168 | Muted Text (Ever) |
| **Blue Highlight** | `#80b8f2` | 128, 184, 242 | Links (Steel) |
| **Blue Alt** | `#c2cfed` | 194, 207, 237 | Muted Text (Steel) |
| **Red Highlight** | `#fa9de7` | 250, 157, 231 | Links (Insight) |
| **Red Alt** | `#ffe0ee` | 255, 224, 238 | Muted Text (Insight) |

### Light Mode Colors

| Farbe | Hex | RGB | Verwendung |
|-------|-----|-----|-----------|
| **Purple Light** | `#ede8fd` | 237, 232, 253 | BG Light (Meteorite) |
| **Green Light** | `#e6f6f5` | 230, 246, 245 | BG Light (Ever) |
| **Blue Light** | `#eaedff` | 234, 237, 255 | BG Light (Steel) |
| **Red Light** | `#feecef` | 254, 236, 239 | BG Light (Insight) |
| **Light Grey** | `#f8f9fb` | 248, 249, 251 | Body BG (alle Themes Light) |

### Dark Mode Colors

| Farbe | Hex | RGB | Verwendung |
|-------|-----|-----|-----------|
| **Purple Dark** | `#0c082f` | 12, 8, 47 | BG Dark (Meteorite) |
| **Green Dark** | `#002039` | 0, 32, 57 | BG Dark (Ever) |
| **Blue Dark** | `#08103f` | 8, 16, 63 | BG Dark (Steel) |
| **Red Dark** | `#0f0523` | 15, 5, 35 | BG Dark (Insight) |

### Semantic Colors (Theme-Unabhängig)

```css
--color-success: #22c55e;
--color-warning: #f59e0b;
--color-error: #ef4444;
--color-info: #3b82f6;
```

---

## ✍️ Typografie

### Font Families

```css
/* @theme Block in app.css */
--font-heading: "Montserrat", sans-serif;  /* Montserrat für Headings */
--font-sans: "Inter", sans-serif;          /* Inter für Body Text */
```

**Hinweis:** Fonts werden via `@fontsource` geladen:

```typescript
import '@fontsource/inter';
import '@fontsource/montserrat/700.css';  // Bold für Headings
```

---

### Heading Scale

| Stufe | Font | Size | Line Height | Weight | Verwendung |
|-------|------|------|-------------|--------|-----------|
| **H1** | Degular Bold | 80px (5rem) | 80px | 700 | Hero Titles |
| **H2** | Degular Bold | 54px (3.375rem) | 54px | 700 | Section Headers |
| **H3** | Degular Bold | 34px (2.125rem) | 34px | 700 | Subsection Headers |
| **H4** | Degular Bold | 22px (1.375rem) | 26px | 700 | Card Titles, Small Headers |

**Fallback:** Wir nutzen Montserrat als Ersatz für Degular (ähnlicher Charakter).

**Implementierung:**

```css
h1 {
  font-family: var(--font-heading);
  font-size: var(--text-h1);  /* 80px */
  font-weight: 700;
  line-height: var(--line-height-tight);
}
```

---

### Body Text Scale

| Stufe | Font | Size | Line Height | Weight | Verwendung |
|-------|------|------|-------------|--------|-----------|
| **Subtitle 1** | Inter Medium | 24px (1.5rem) | 36px | 500 | Lead Paragraphs |
| **Subtitle 2** | Inter Regular | 20px (1.25rem) | 28px | 400 | Subheadings |
| **Text** | Inter Regular | 16px (1rem) | 24px | 400 | Body Text, Paragraphs |
| **Small** | Inter Regular | 14px (0.875rem) | 20px | 400 | Captions, Meta-Info |
| **Tiny** | Inter Regular | 12px (0.75rem) | 18px | 400 | Footnotes |

**CSS-Variablen:**

```css
--text-h1: 80px;
--text-h2: 54px;
--text-h3: 34px;
--text-h4: 22px;

--text-base: 1rem;      /* 16px */
--text-sm: 0.875rem;    /* 14px */
--text-xs: 0.75rem;     /* 12px */
--text-lg: 1.25rem;     /* 20px */
--text-xl: 1.5rem;      /* 24px */

--line-height-tight: 1.2;
--line-height-normal: 1.5;
--line-height-relaxed: 1.75;
```

---

### Spezielle Text-Elemente

#### Quotes

```css
blockquote {
  font-family: var(--font-sans);
  font-size: 16px;
  font-style: italic;
  line-height: 24px;
  border-left: 2px solid var(--core-primary);
  padding-left: 1rem;
  background-color: #f8f9fb;
  color: #433f65;
}
```

#### Lists

```css
ul, ol {
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 24px;
  color: #433f65;
  padding-left: 30px;
}

li::marker {
  color: var(--core-primary);
}
```

#### Links

```css
a {
  font-family: var(--font-sans);
  font-size: 16px;
  line-height: 24px;
  color: var(--color-accent);
  text-decoration: underline;
  transition: color var(--duration-normal);
}

a:hover {
  color: var(--highlight-primary);
}
```

---

## 📐 Spacing & Layout

### Spacing Scale (Tailwind v4)

```css
/* Basis: 0.25rem = 4px */
--spacing-0: 0;
--spacing-1: 0.25rem;   /* 4px */
--spacing-2: 0.5rem;    /* 8px */
--spacing-3: 0.75rem;   /* 12px */
--spacing-4: 1rem;      /* 16px */
--spacing-5: 1.25rem;   /* 20px */
--spacing-6: 1.5rem;    /* 24px */
--spacing-8: 2rem;      /* 32px */
--spacing-10: 2.5rem;   /* 40px */
--spacing-12: 3rem;     /* 48px */
--spacing-16: 4rem;     /* 64px */
--spacing-20: 5rem;     /* 80px */
--spacing-24: 6rem;     /* 96px */

/* Custom Spacing */
--spacing-gutter: 1.5rem;    /* 24px - Standard Gutter */
--spacing-section: 4rem;      /* 64px - Section Padding */
```

**Verwendung in Tailwind:**

```html
<div class="px-6 py-16">  <!-- 24px horizontal, 64px vertical -->
<div class="space-y-4">   <!-- 16px gap zwischen Kindern -->
```

---

### Container & Grid

#### Container

```css
.container {
  max-width: 1280px;
  margin-inline: auto;
  padding-inline: var(--spacing-gutter);
}

/* Responsive Breakpoints */
@media (max-width: 640px) {
  .container { max-width: 640px; }
}
@media (max-width: 768px) {
  .container { max-width: 768px; }
}
@media (max-width: 1024px) {
  .container { max-width: 1024px; }
}
```

#### Grid System

```css
.grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.5rem; }
.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; }

/* Responsive */
@media (max-width: 768px) {
  .grid-3, .grid-4 { grid-template-columns: 1fr; }
}
```

---

### Border Radius

```css
--radius-sm: 0.25rem;   /* 4px - Small Elements */
--radius-md: 0.5rem;    /* 8px - Buttons, Cards */
--radius-lg: 1rem;      /* 16px - Large Cards */
--radius-xl: 1.5rem;    /* 24px - Hero Cards */
--radius-full: 9999px;  /* Pills, Badges */
```

---

### Shadows

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
--shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.1);
--shadow-2xl: 0 25px 50px rgba(0, 0, 0, 0.25);

/* Glow Effects */
--shadow-glow-purple: 0 0 20px rgba(78, 33, 231, 0.5);
--shadow-glow-blue: 0 0 20px rgba(51, 78, 255, 0.5);
--shadow-glow-green: 0 0 20px rgba(13, 164, 154, 0.5);
--shadow-glow-red: 0 0 20px rgba(238, 72, 95, 0.5);
```

---

## 🧩 Komponenten

### Buttons

#### Primary Button

**Design Specs:**

- Font: Degular Semibold, 16px, 24px line-height
- Padding: 12px 24px
- Border Radius: 8px (--radius-md)
- Transition: 150ms ease

**States:**

```css
/* Default */
.btn-primary {
  background: var(--btn-primary-bg);
  color: var(--btn-primary-text);
  padding: 0.75rem 1.5rem;
  border-radius: var(--radius-md);
  font-weight: 600;
  transition: all var(--duration-fast);
}

/* Hover - 10% lighter */
.btn-primary:hover {
  background: color-mix(in srgb, var(--btn-primary-bg) 90%, white);
  box-shadow: var(--shadow-md);
}

/* Inactive/Disabled */
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

**Svelte 5 Component:**

```svelte
<script lang="ts">
  interface Props {
    variant?: 'primary' | 'secondary' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    onclick?: () => void;
    children: import('svelte').Snippet;
  }

  let { variant = 'primary', size = 'md', disabled = false, onclick, children }: Props = $props();
</script>

<button
  class="btn btn-{variant} btn-{size}"
  {disabled}
  {onclick}
>
  {@render children()}
</button>

<style>
  .btn {
    font-family: var(--font-heading);
    font-weight: 600;
    border-radius: var(--radius-md);
    transition: all var(--duration-fast);
    cursor: pointer;
  }

  .btn-primary {
    background: var(--btn-primary-bg);
    color: var(--btn-primary-text);
  }

  .btn-md {
    padding: 0.75rem 1.5rem;
    font-size: 1rem;
  }
</style>
```

---

#### Button Arrow Icon

**Specs:**

- Height: 9.5px
- Width: 6.5px (Default) / 8.5px (Hover)
- Stroke: 2px
- Color: White

**SVG:**

```svg
<svg width="9" height="10" viewBox="0 0 9 10" fill="none">
  <path d="M1 1L7 5L1 9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>
```

---

### Cards

#### Standard Card

---

### Navigation

#### Main Navigation

**Specs:**

- Background: Glassmorphism (backdrop-blur)
---

### Hero Section

**Design Specs:**

- Height: 100vh (min: 600px)
- Background: Radial Gradient + 3D Scene (Threlte)
- Content: Center-aligned
- CTA: Primary Button

---

## 🎨 Icons & Grafische Elemente

### Dots Pattern

**Verwendung:** Background-Dekoration

```css
.dots-pattern {
  background-image: radial-gradient(
    circle,
    var(--core-primary) 1px,
    transparent 1px
  );
  background-size: 40px 40px;
  opacity: 0.1;
}
```

### Stars Decoration

**Specs:** SVG-basierte Sterne als Akzent-Elemente

```svg
<svg width="24" height="24" viewBox="0 0 24 24" fill="var(--color-accent)">
  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
</svg>
```

### Pattern Background (Light Mode)

**Asset:** `/assets/pattern-lg.svg`

```css
.theme-meteorite[data-mode="light"] {
  background-image: url("/assets/pattern-lg.svg");
  background-size: 800px;
  background-repeat: repeat;
  background-attachment: fixed;
  background-blend-mode: multiply;
}
```

---

## ⚡ Animation & Transitions

### Transition Durations

```css
--duration-fast: 150ms;
--duration-normal: 300ms;
--duration-slow: 500ms;

/* Easing Functions */
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-out: cubic-bezier(0, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
```

### Standard Transitions

```css
/* Hover Effects */
.transition-hover {
  transition: all var(--duration-fast) var(--ease-in-out);
}

/* Page Transitions */
.page-transition {
  transition: opacity var(--duration-normal) var(--ease-out);
}

/* Scale Animation */
@keyframes scale-in {
  from { transform: scale(0.95); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.animate-scale-in {
  animation: scale-in var(--duration-normal) var(--ease-out);
}
```

### Svelte 5 Transitions


---

## 💻 Implementierung in Svelte 5

### Theme Switching State
