## 📖 Über dieses Dokument

### Unterschied: Corporate Design vs. Brand Guidelines

**Corporate Design** (dieses Dokument):

- Fokus auf **visuelle Anwendung**
- Logo-Nutzung, Farben, Typografie
- Layout-Regeln, Spacing
- Print & Digital Assets
- Praktische Do's & Don'ts

**Brand Guidelines** ([SYSTEM_BRAND_GUIDELINES.md](SYSTEM_BRAND_GUIDELINES.md)):

- Umfassendes Design System
- Technische Implementierung (Svelte 5, Tailwind CSS v4)
- Code-Patterns, Komponenten
- SEO & Accessibility
- Development-Fokus

**Dieses Dokument** richtet sich an:

- Grafik Designer
- Marketing Team
- Partner & Agenturen
- Externe Dienstleister

---

## 🎨 Logo & Markenzeichen

### Logo-Varianten

#### Primäres Logo (Horizontal)

**Dateien:**
**Größen:**

- Minimum:  Breite
- Empfohlen Web:  Breite
- Print:  Breite

---

### Schutzraum (Clear Space)

**Regel:** Mindestens **X-Höhe** (Höhe des "H") als Abstand ringsum


**Niemals:**

- ❌ Logo auf gemustertem Hintergrund ohne Kontrast
- ❌ Logo verzerren oder schräg stellen
- ❌ Farben ändern (außer definierte Varianten)
- ❌ Effekte hinzufügen (Schatten, 3D, Neon)

---

### Logo-Farben nach Kontext

| Kontext | Logo-Variante | Farbe | Datei |
|---------|--------------|-------|-------|
| **Dark Mode** | Standard | Purple + White | `logo.png` |
| **Light Mode** | Dark | Purple + Meteorite | `logo-dark.png` |
| **Print (4c)** | Standard | CMYK 60/100/0/0 | `logo-cmyk.eps` |
| **Print (1c)** | Schwarz | K 100% | `logo-black.eps` |
| **Negativ** | Weiß | White 100% | `logo-white.png` |

---

## 🌈 Farbsystem

### Primäre Markenfarben

#### Purple (Meteorite Theme)

```css
Purple:     #4e21e7  |  RGB 78, 33, 231   |  CMYK 60/100/0/0
Meteorite:  #433f65  |  RGB 67, 63, 101   |  CMYK 82/77/33/23
```

**Verwendung:**

- Hauptfarbe für Brand Kommunikation
- Logo, Headlines, Call-to-Actions
- Blog, generische Content-Pages

#### Blue PRO (Steel Theme)

```css
Blue PRO:   #334eff  |  RGB 51, 78, 255   |  CMYK 100/20/10/0
```

**Verwendung:**


#### Green ( Theme)

```css
Green Free: #0da49a  |  RGB 13, 164, 154  |  CMYK 78/9/46/0
```

**Verwendung:**


#### Red Insights (Insight Theme)

```css
Red Insights: #ee485f  |  RGB 238, 72, 95  |  CMYK 0/83/48/0
```

**Verwendung:**


---

### Sekundäre Farben

#### Neutrals

```css
White:       #ffffff  |  RGB 255, 255, 255  |  CMYK 0/0/0/0
Light Grey:  #f8f9fb  |  RGB 248, 249, 251  |  CMYK 2/1/0/0
Meteorite:   #433f65  |  RGB 67, 63, 101    |  CMYK 82/77/33/23
```

#### Dark Modes

```css
Purple Dark:    #0c082f  |  RGB 12, 8, 47     |  CMYK 100/97/46/66
Blue Dark:      #08103f  |  RGB 8, 16, 63     |  CMYK 100/94/43/53
Green Dark:     #002039  |  RGB 0, 32, 57     |  CMYK 100/83/48/58
Red Dark:       #0f0523  |  RGB 15, 5, 35     |  CMYK 99/95/49/75
```

---

### Farbhierarchie

**Priorität 1 - Dominanz (60%):**

- Backgrounds (Dark/Light je nach Theme)
- Große Flächen

**Priorität 2 - Akzent (30%):**

- Primary Brand Color (Purple/Blue/Green/Red)
- Buttons, Links, CTAs

**Priorität 3 - Highlights (10%):**

- Hover-States, Icons, Badges
- Subtile Akzente

---

### Farb-Kombinationen (Approved)

#### Meteorite Theme

```
Background:    #0c082f (Purple Dark)
Surface:       #1a1442 (Slightly lighter)
Text:          #ede8fd (Purple Light)
Accent:        #4e21e7 (Purple)
Hover:         #7383f5 (Purple Highlight)
```

#### Steel Theme (Professional)

```
Background:    #08103f (Blue Dark)
Surface:       #0f1854
Text:          #eaedff (Blue Light)
Accent:        #334eff (Blue PRO)
Hover:         #80b8f2 (Blue Highlight)
```

#### Light Mode (Alle Themes)

```
Background:    #f8f9fb (Light Grey)
Surface:       #ffffff (White)
Text:          #433f65 (Meteorite)
Accent:        [Theme-specific]
Border:        #e2e8f0 (Light Border)
```

---

## ✍️ Typografie

### Schriftfamilien

#### Headlines & Display

```
**Verwendung:**

- H1-H4 (Alle Headlines)
- Logo-Texte
- Call-to-Action Buttons
- Feature-Titles

#### Body Text & UI

```
Familie:     Inter
Gewichte:    400 (Regular), 500 (Medium), 600 (SemiBold)
Fallback:    -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
Lizenz:      Open Font License (Google Fonts)
```

**Verwendung:**

- Fließtext, Paragraphen
- Navigation, UI-Elemente
- Listen, Captions
- Formulare, Inputs

---

### Typografie-Skala

#### Headlines (Montserrat Bold)

```
H1:  80px / 5rem      | Line-Height: 80px  | Desktop Hero
H2:  54px / 3.375rem  | Line-Height: 54px  | Section Headers
H3:  34px / 2.125rem  | Line-Height: 34px  | Subsections
H4:  22px / 1.375rem  | Line-Height: 26px  | Card Titles
```

#### Body Text (Inter)

```
Subtitle 1:  24px / 1.5rem    | Line-Height: 36px  | Lead Paragraphs
Subtitle 2:  20px / 1.25rem   | Line-Height: 28px  | Subheadings
Body:        16px / 1rem      | Line-Height: 24px  | Standard Text
Small:       14px / 0.875rem  | Line-Height: 20px  | Captions, Meta
Tiny:        12px / 0.75rem   | Line-Height: 18px  | Footnotes
```

---

### Typografie-Regeln

**1. Zeilenlänge (Line Length):**

- Optimal: 60-80 Zeichen pro Zeile
- Maximum: 90 Zeichen
- Minimum: 40 Zeichen

**2. Zeilenhöhe (Line Height):**

- Headlines: 1.0 - 1.2 (tight)
- Body Text: 1.5 (normal)
- Lead Text: 1.75 (relaxed)

**3. Buchstabenabstand (Letter Spacing):**

- Headlines: -0.02em (tight)
- Body: 0 (normal)
- Uppercase Text: 0.1em - 0.3em (wide)

**4. Hierarchie:**

```
H1 (Hero)
  ↓ 2rem Abstand
H2 (Section)
  ↓ 1.5rem Abstand
Body Text
  ↓ 1rem Abstand zwischen Paragraphen
```

---

### Text-Farben nach Kontext

#### Dark Mode

```css
Primary Text:    #ede8fd  (Purple Light / Theme-specific)
Secondary Text:  #c2befa  (Purple Alt / Muted)
Tertiary Text:   #433f65  (Meteorite / Low emphasis)
Links:           #7383f5  (Highlight Color)
```

#### Light Mode

```css
Primary Text:    #433f65  (Meteorite)
Secondary Text:  #5a587a  (Darker Grey)
Tertiary Text:   #9ca3af  (Light Grey)
Links:           #4e21e7  (Purple / Theme-specific)
```

---

## 📸 Bildwelt & Fotografie

### Fotografie-Stil

**Ästhetik:**

- ✅ Modern, Tech-orientiert
- ✅ Futuristisch, aber zugänglich
- ✅ Hoher Kontrast, satte Farben
- ✅ Dark Backgrounds mit Neon-Akzenten
- ✅ 3D-Renderings, Sci-Fi Elemente

**Themen:**

- XR/AR/VR Technologie
- Metaverse-Welten
- Digitale Transformation
- Futuristische Städte (Blade Runner Ästhetik)
- Code, Screens, UI-Elemente

**Vermeiden:**

- ❌ Generische Stock-Photos
- ❌ Überbelichtete, flache Bilder
- ❌ Klischee-Business-Fotos (Handshake, etc.)

---

### Bild-Behandlung

#### Color Grading

```
Temperatur:     Kalt (4500-5000K)
Kontrast:       +20 bis +30
Sättigung:      +10 bis +15
Schatten:       Tiefschwarz (#0c082f)
Highlights:     Theme-Color Tint (Purple/Blue/Green/Red)
```

#### Overlay-Effekte

```css
/* Gradient Overlay für Hero-Images */
background: linear-gradient(
  135deg,
  rgba(12, 8, 47, 0.8) 0%,
  rgba(78, 33, 231, 0.4) 100%
);
```

---

### Bildformate & Größen

#### Web

```
Hero Images:       1920x1080px  (16:9)  |  WebP, JPEG Quality 85%
Card Images:       800x450px    (16:9)  |  WebP, JPEG Quality 80%
Blog Featured:     1200x630px   (OG)   |  WebP, JPEG Quality 85%
Thumbnails:        400x400px    (1:1)  |  WebP, JPEG Quality 75%
Icons/Logos:       SVG (vector) oder PNG 2x (Retina)
```

#### Print

```
Broschüren:        300 DPI  |  CMYK  |  PDF/X-3
Visitenkarten:     300 DPI  |  CMYK  |  mit Beschnitt 3mm
Roll-Ups:          150 DPI  |  RGB → CMYK Konversion prüfen
```

---

### Aspect Ratios

```
16:9  →  Standard (Video, Hero, Cards)
4:3   →  Portfolio-Items, Screenshots
1:1   →  Social Media, Thumbnails
21:9  →  Ultrawide Hero Sections
9:16  →  Mobile Stories, Vertical Video
```

---

## 📐 Layout & Grid

### Grid-System

**Desktop (1280px Container):**

```
Columns:      12
Gutter:       24px (1.5rem)
Margins:      24px (1.5rem)
Max-Width:    1280px
```

**Tablet (768px):**

```
Columns:      8
Gutter:       20px
Margins:      20px
```

**Mobile (375px):**

```
Columns:      4
Gutter:       16px
Margins:      16px
```

---

### Spacing-System

**Basis:** 4px Increment (0.25rem)

```
4px   (0.25rem)   →  Micro Spacing (Icon Gaps)
8px   (0.5rem)    →  Tight Spacing (Button Padding)
12px  (0.75rem)   →  Small Gaps
16px  (1rem)      →  Standard Spacing (Paragraphs)
24px  (1.5rem)    →  Gutter (Component Gaps)
32px  (2rem)      →  Section Spacing
48px  (3rem)      →  Large Section Gaps
64px  (4rem)      →  Hero Padding
96px  (6rem)      →  Extra Large Spacing
```

**Anwendung:**

```css
/* Component Padding */
padding: 1.5rem;  /* 24px */

/* Section Spacing */
margin-block: 4rem;  /* 64px top & bottom */

/* Element Gaps */
gap: 1rem;  /* 16px zwischen Kindern */
```

---

### Responsive Breakpoints

```css
/* Mobile First */
/* Base: 375px+ */

@media (min-width: 640px) {  /* Small */
  /* Tablets */
}

@media (min-width: 768px) {  /* Medium */
  /* Tablets Landscape, Small Desktop */
}

@media (min-width: 1024px) { /* Large */
  /* Desktop */
}

@media (min-width: 1280px) { /* XL */
  /* Large Desktop */
}

@media (min-width: 1536px) { /* 2XL */
  /* Ultra Wide */
}
```

---

### Layout-Patterns

#### Hero Section

```
┌─────────────────────────────────────┐
│  [100vh min-height]                 │
│                                     │
│         HERO TITLE (H1)             │
│         Subtitle Text               │
│         [CTA Button]                │
│                                     │
│  [3D Background / Threlte Scene]    │
└─────────────────────────────────────┘
```

#### Content Section

```
┌─────────────────────────────────────┐
│  [Container: max-width 1280px]      │
│                                     │
│  Section Heading (H2)               │
│  ────────────────                   │
│                                     │
│  ┌─────┐  ┌─────┐  ┌─────┐         │
│  │Card │  │Card │  │Card │         │
│  │     │  │     │  │     │         │
│  └─────┘  └─────┘  └─────┘         │
│                                     │
└─────────────────────────────────────┘
```

#### Blog Post Layout

```
┌─────────────────────────────────────┐
│  [Hero Image 16:9]                  │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  [Container: max-width 800px]       │
│                                     │
│  Article Title (H1)                 │
│  Meta: Date • Reading Time          │
│  ────────────────                   │
│                                     │
│  Body Text (16px, 1.5 line-height)  │
│                                     │
│  Paragraph...                       │
│                                     │
│  ## Subheading (H2)                 │
│  More content...                    │
│                                     │
└─────────────────────────────────────┘
```

---

## 🎨 Grafische Elemente

### Dots Pattern (Hintergrund-Dekoration)

**CSS Implementation:**

```css
.dots-pattern {
  background-image: radial-gradient(
    circle,
    var(--core-primary) 1px,
    transparent 1px
  );
  background-size: 40px 40px;
  opacity: 0.1;
  position: absolute;
  inset: 0;
}
```

**Verwendung:**

- Subtile Hintergründe für Sections
- Hero-Bereiche (sehr geringe Opacity)
- Niemals auf Fließtext

---

### Gradient Overlays

**Radial Gradient (Hero)**

```css
background: radial-gradient(
  farthest-side at top,
  #2b1f99,  /* Gradient Light */
  #0c082f   /* Gradient Dark */
);
```

**Linear Gradient (Cards)**

```css
background: linear-gradient(
  135deg,
  var(--bg-surface) 0%,
  var(--bg-surface-2) 100%
);
```

---

### Glow Effects

**Button Hover:**

```css
box-shadow: 0 0 20px rgba(78, 33, 231, 0.5);
```

**Theme-Specific Glows:**

```css
/* Purple */
--shadow-glow-purple: 0 0 20px rgba(78, 33, 231, 0.5);

/* Blue */
--shadow-glow-blue: 0 0 20px rgba(51, 78, 255, 0.5);

/* Green */
--shadow-glow-green: 0 0 20px rgba(13, 164, 154, 0.5);

/* Red */
--shadow-glow-red: 0 0 20px rgba(238, 72, 95, 0.5);
```

---

### Icons & Symbole

**Stil:**

- Outline (2px Stroke)
- Rounded Corners
- 24x24px Base Size
- Skalierbar (SVG)

**Farbe:**

- Default: `currentColor` (inherit)
- Accent: Theme-specific Primary
- Inactive: 50% Opacity

**Quellen:**

- [Heroicons](https://heroicons.com/) (Primary)
- [Lucide Icons](https://lucide.dev/) (Alternative)
- Custom SVGs (brand-specific)

---

### Arrows & Indicators

**Button Arrow (Standard):**

```svg
<svg width="9" height="10" viewBox="0 0 9 10">
  <path 
    d="M1 1L7 5L1 9" 
    stroke="currentColor" 
    stroke-width="2" 
    stroke-linecap="round"
  />
</svg>
---

### Weitere Dokumentation

- **[SYSTEM_BRAND_GUIDELINES.md](SYSTEM_BRAND_GUIDELINES.md)** - Technisches Design System
- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - Schnellreferenz für Entwickler
- **[DEVELOPMENT.md](DEVELOPMENT.md)** - Development Guide
- **[ROADMAP.md](ROADMAP.md)** - Projekt-Roadmap

---

### Support & Kontakt

**Design-Fragen:**
📧 <design@heinze.media>

**Technische Fragen:**
📧 <dev@heinze.media>

**Partner & Agenturen:**
📧 <partners@heinze.media>

---

## 🔄 Changelog

**v1.0 - Januar 2026**

- Initiale Version
- 4-Theme System definiert
- Logo-Regeln dokumentiert
- Typografie-System etabliert
- Layout-Guidelines erstellt

---

*Dieses Corporate Design Manual ist ein Living Document und wird bei Bedarf aktualisiert.*

**Letzte Aktualisierung:** 25. Januar 2026
