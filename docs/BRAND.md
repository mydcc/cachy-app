# Brand & Design

The canonical brand document for Cachy. It replaces `BRAND GUIDELINES.md`,
`CORPORATE_DESIGN.md` and `SYSTEM_BRAND_GUIDELINES.md`, which said three
different things (roadmap item 11).

**Source of truth:** the code, not this file.

| What | Authoritative source |
| --- | --- |
| Colours | `src/themes.css` |
| Fonts | `src/app.css` (`@font-face`) and the font picker in `src/lib/constants.ts` |
| Original artwork | `brand_guidelines/` — 17 JPG pages, the designed original |

Everything below marked **verified** was read out of those files. Everything
marked **intent** is design guidance carried over from the old documents that
nothing in the code enforces — useful for a designer, not a claim about the app.

---

## 1. Core colours (verified)

Five brand colours, identical in all four brand themes:

| Name | Hex | RGB | CSS variable |
| --- | --- | --- | --- |
| Purple | `#4e21e7` | 78 33 231 | `--core-purple` |
| Meteorite | `#433f65` | 67 63 101 | `--core-meteorite` |
| Green Free | `#0da49a` | 13 164 154 | `--core-green-free` |
| Blue PRO | `#334eff` | 51 78 255 | `--core-blue-pro` |
| Red Insights | `#ee485f` | 238 72 95 | `--core-red-insights` |

### Light and dark pairs

| Variable | Hex | Variable | Hex |
| --- | --- | --- | --- |
| `--purple-light` | `#ede8fd` | `--purple-dark` | `#0c082f` |
| `--green-free-light` | `#e6f6f5` | `--green-free-dark` | `#002039` |
| `--blue-pro-light` | `#eaedff` | `--blue-pro-dark` | `#08103f` |
| `--red-insights-light` | `#feecef` | `--red-insights-dark` | `#0f0523` |

Meteorite has no light or dark variant — it is the neutral base.

### Highlighting colours

Use sparingly, alongside the core colours.

| Variable | Hex |
| --- | --- |
| `--highlight-purple` | `#7383f5` |
| `--highlight-meteorite` | `#c2befa` |
| `--highlight-green-free` | `#48b0b2` |
| `--highlight-green-alt` | `#7fb5a8` (defined only in `.theme-ever`) |
| `--highlight-blue-pro` | `#80b8f2` |
| `--highlight-blue-pro-alt` | `#c2cfed` |
| `--highlight-red` | `#fa9de7` |
| `--highlight-red-alt` | `#ffe0ee` |

### Gradient colours

| Variable | Hex | Variable | Hex |
| --- | --- | --- | --- |
| `--gradient-purple-light` | `#2b1f99` | `--gradient-purple-dark` | `#0c082f` |
| `--gradient-green-light` | `#3c8499` | `--gradient-green-dark` | `#002039` |
| `--gradient-blue-light` | `#3c6e99` | `--gradient-blue-dark` | `#08103f` |
| `--gradient-red-light` | `#6d2954` | `--gradient-red-dark` | `#0f0523` |

### Button hover colours

Bound to `--accent-hover-derived` per theme.

| Base | Hover |
| --- | --- |
| Purple `#4e21e7` | `#714deb` |
| Green Free `#0da49a` | `#3db6af` |
| Blue PRO `#334eff` | `#5c71ff` |
| Red Insights `#ee485f` | `#f46d7e` |

---

## 2. Themes (verified)

### The four brand themes

| Theme | Accent | Text | Intended for |
| --- | --- | --- | --- |
| `.theme-meteorite` | Purple family | `--purple-light` | Default, generic surfaces |
| `.theme-steel` | Blue PRO | `--blue-pro-light` | Professional / Pro features |
| `.theme-ever` | Green Free | `--green-free-light` | Community, free features |
| `.theme-insight` | Red Insights | `--red-insights-light` | Offers, high-attention surfaces |

Two places where the implementation deliberately departs from the old
documents. Both are recorded rather than "corrected", because the code is what
users see and neither looks accidental:

- **`.theme-meteorite` sets `--accent-color: var(--core-blue-pro)`**, not Purple.
  The documents described Purple as the accent for this theme.
- **`.theme-ever` and `.theme-insight` use literal background gradients**
  (`#052618 → #010f08`, `#3d050e → #0f0505`) rather than their
  `--gradient-*` tokens. Those are much darker than the documented gradients —
  consistent with a trading UI that runs dark.

### The other 23

`src/themes.css` ships **27** themes. Beyond the four brand themes there are
editor-inspired ones — Dracula, Nord, Tokyo Night, Gruvbox, Solarized, Catppuccin,
Monokai, Ayu, GitHub, One Dark Pro, Night Owl, Everforest, Cobalt2, Matrix, and
plain light/dark/midnight/obsidian variants.

They are **not** brand themes and are not held to the brand palette. Cachy is a
tool people keep open for hours next to their editor, and letting them match it
is a feature. The brand palette governs the four brand themes, marketing surfaces
and anything user-facing outside the theme system.

---

## 3. Using colours in code (verified — this is a hard rule)

From `CLAUDE.md`, and enforced by review:

- **No hardcoded colours in components.** No `#ffffff`, no `rgb(...)`. Only CSS
  variables: `var(--bg-primary)`, `var(--text-secondary)`, `var(--accent-color)`.
- For a background together with its text colour, use the **paired classes** from
  `src/themes.css` (lines 3081+): `.bg-accent-paired`, `.bg-success-paired`,
  `.bg-danger-paired`, `.bg-warning-paired`, and the hover variants
  `.hover-bg-accent-paired`, `.hover-bg-success-paired`, `.hover-bg-danger-paired`.
  They set foreground and background together, so contrast holds in all 27 themes.

A hardcoded colour is not a style preference here — it is a bug that only shows up
in the 26 themes nobody tested.

---

## 4. Typography

**Verified:** the app ships a font picker. `src/app.css` declares `@font-face`
for Inter (the default), IBM Plex Sans, JetBrains Mono, Roboto Mono,
Source Sans 3, Manrope, Nunito Sans and Red Hat Display; the user's choice is the
`fontFamily` setting.

**Unresolved — a decision is needed.** The three old documents disagreed about the
headline typeface and none of them matches the app:

| Source | Headline font |
| --- | --- |
| `BRAND GUIDELINES.md` | Degular Bold |
| `CORPORATE_DESIGN.md` | Montserrat Bold |
| `SYSTEM_BRAND_GUIDELINES.md` | **both** — `--font-heading: "Montserrat"` on line 234, then a type scale specifying Degular Bold on line 251 |
| The app | no separate headline font — headings use the chosen body font |

The third document contradicted itself within twenty lines, which is a fair
summary of why these files needed consolidating.

Degular is a commercial typeface; Montserrat is free. Whichever is correct, it
should be recorded here and, if it is meant to apply to the app, actually loaded.
Until then, treat the app's behaviour as the truth: one font family throughout,
chosen by the user.

**Intent** — the type scale both old documents agreed on, for marketing surfaces:

| Level | Size | Line height |
| --- | --- | --- |
| Title 1 | 80px | 80px |
| Title 2 | 54px | 54px |
| Title 3 | 34px | 34px |
| Title 4 | 22px | 26px |
| Subtitle 1 | 24px | 36px |
| Subtitle 2 | 20px | 28px |
| Body | 16px | 24px |

Body text in Inter Regular, Meteorite `#433f65`, on light backgrounds.

---

## 5. Layout (intent)

Carried over from `CORPORATE_DESIGN.md`. Nothing in the app enforces these; they
are the defaults of Tailwind CSS v4, which is a dependency.

- **Spacing:** 4px increments — 4, 8, 12, 16, 24, 32, 48, 64, 96.
- **Breakpoints:** 640 / 768 / 1024 / 1280 / 1536px, mobile first.
- **Line length:** 60–80 characters.

---

## 6. Logo

The logo files and their rules live in `brand_guidelines/` (pages 1–10). The old
`CORPORATE_DESIGN.md` had a logo section whose file names, minimum sizes and clear
space values were **blank** — the placeholders were never filled in. They are not
reproduced here rather than invented.

What survived, unambiguous in the original: never place the logo on a patterned
background without contrast, never distort or skew it, never recolour it outside
the defined variants, never add shadow, 3D or glow effects.

---

## 7. What happened to the old documents

| File | Status | Why |
| --- | --- | --- |
| `BRAND GUIDELINES.md` | **deleted** | A text extraction of the `brand_guidelines/` JPGs with **corrupted hex values** — see below. The JPGs remain as the original. |
| `CORPORATE_DESIGN.md` | **deleted** | Verified content merged here. Its logo and typography sections were half-empty placeholders. |
| `SYSTEM_BRAND_GUIDELINES.md` | **deleted** | Its palette and 4-theme system were correct and are merged here. The rest described a different website. |
| `brand_guidelines/` | **kept** | The designed original, and the only complete record of the logo rules. |

### The corrupted hex values

`BRAND GUIDELINES.md` was OCR output, and the extraction truncated most hex codes
while leaving the RGB values intact. Anyone copying a colour out of it would have
got an invalid value:

| In that file | Correct (`src/themes.css`) |
| --- | --- |
| `#4e21e` | `#4e21e7` |
| `#e6f6f` | `#e6f6f5` |
| `#7383f` | `#7383f5` |
| `#48b` | `#48b0b2` |
| `#80b8f` | `#80b8f2` |
| `#fa9de` | `#fa9de7` |
| `#2b1f` | `#2b1f99` |
| `#3c` (green), `#3c6e` (blue) | `#3c8499`, `#3c6e99` |
| `#6d` | `#6d2954` |
| `#0f` | `#0f0523` |
| `#` (green dark) | `#002039` |

Every one of them is recoverable, because the RGB triples survived and match
`src/themes.css` exactly. That agreement is also what confirms the implemented
palette *is* the designed palette.

One value does not reconcile: the file gives Green Free Light highlight as
RGB 72 176 130 (`#48b082`), while `src/themes.css` has `#48b0b2` (72 176 178).
Since the last channel is exactly where the OCR damage clusters, the code is the
better witness — but `brand_guidelines/` page 15 would settle it.

### The other-website problem

`SYSTEM_BRAND_GUIDELINES.md` assigned the four themes to routes that do not exist
in this project — `/services`, `/xr-studio`, `/solutions`, `/offer/free-ebook`,
`/offer/special-deal`, `/work/n8n-nodes` — and `BRAND GUIDELINES.md` ended with
the footer *"HEINZE MEDIA is a WordPress SEO Plugin for your website"*.

Both were written for a different property and reused here without adaptation.
The palette they carry is genuinely Cachy's, which is why it is kept; the routing
and positioning around it never applied and has been dropped.
