#!/bin/bash
#
# Copyright (C) 2026 MYDCT
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

# Regenerate the WOFF2 fonts in static/fonts (FEAT-0775).
#
# The repository ships the result, not the sources: fetching the Google Fonts
# archives once and running this script reproduces the files byte-for-byte for
# the same fontTools version. Usage:
#
#   pip install "fonttools[woff]==4.68.0"
#   scripts/subset-fonts.sh <dir-with-source-ttf> [<output-root>]
#
# <dir-with-source-ttf> must mirror static/fonts: <Family>/<File>.ttf. The
# output root defaults to static/fonts and receives <Family>/<File>.woff2.
# OFL.txt and README.txt are untouched — the licence has to travel with the
# font.
#
# Why these two axes of the subset:
#
#   unicode-range — latin + latin-ext, as Google Fonts defines them for these
#                   two subsets, plus the symbols the UI actually renders in
#                   text: arrows (→ ↔ ↗ ↳), comparisons (≤ ≥ ≈), marks
#                   (✓ ✗ ✕ ❌ ★ ▲ ▶ ▼ ▸), the warning/bolt pair (⚠ ⚡), Σ, ₿,
#                   ╱ and the lock. Those were in the original files and are
#                   used by de.json/en.json and the .svelte sources; without
#                   them the subset silently falls back to a system font for a
#                   glyph the design already had. Emoji beyond that set are not
#                   in these fonts and always fell back.
#   features      — ccmp/locl for correct locale forms, mark/mkmk so combining
#                   accents keep their position in decomposed text,
#                   kern/liga/clig/calt for normal shaping, case for all-caps
#                   runs, tnum/zero for the tabular numbers used in tables and
#                   price fields. The stylistic sets (ss01-ss08, cv01-cv14,
#                   salt, aalt) are dropped: nothing in src/ sets
#                   font-feature-settings or font-variant-alternates, so no UI
#                   path can reach them. Variable axes are kept — the
#                   @font-face weight ranges and font-optical-sizing depend on
#                   them.
#
# Nothing here is size-optimal by accident: re-measure and adjust the numbers in
# the item if a font release changes the glyph set.

set -euo pipefail

SRC="${1:?usage: subset-fonts.sh <dir-with-source-ttf> [<output-root>]}"
OUT="${2:-$(cd "$(dirname "$0")/.." && pwd)/static/fonts}"

if ! command -v pyftsubset >/dev/null 2>&1; then
    echo "pyftsubset not found. Install it with: pip install \"fonttools[woff]==4.68.0\"" >&2
    exit 1
fi

# latin + latin-ext, as Google Fonts defines them for these two subsets.
UNICODES="U+0000-00FF,U+0100-024F,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2000-206F,U+20A0-20AB,U+20AC,U+2113,U+2122,U+2190-2197,U+21B3,U+2212,U+2215,U+2248,U+2264-2265,U+2571,U+25B2-25BE,U+2605,U+26A0-26A1,U+2713-2717,U+274C,U+03A3,U+20BF,U+1F512,U+A720-A7FF,U+FEFF,U+FFFD"
FEATURES="ccmp,locl,mark,mkmk,kern,liga,clig,calt,case,tnum,zero"

# Every face referenced by a @font-face in src/app.css. Keep the two lists in
# step: a face added there without a line here ships no file and 404s at
# runtime, which no type check catches.
FACES=(
    "Inter/Inter-VariableFont_opsz,wght"
    "Inter/Inter-Italic-VariableFont_opsz,wght"
    "IBM_Plex_Sans/IBMPlexSans-VariableFont_wdth,wght"
    "JetBrains_Mono/JetBrainsMono-VariableFont_wght"
    "Roboto_Mono/RobotoMono-VariableFont_wght"
    "Source_Sans_3/SourceSans3-VariableFont_wght"
    "Manrope/Manrope-VariableFont_wght"
    "Nunito_Sans/NunitoSans-VariableFont_YTLC,opsz,wdth,wght"
    "Nunito_Sans/NunitoSans-Italic-VariableFont_YTLC,opsz,wdth,wght"
    "Red_Hat_Display/RedHatDisplay-VariableFont_wght"
    "Red_Hat_Display/RedHatDisplay-Italic-VariableFont_wght"
    "Schibsted_Grotesk/SchibstedGrotesk-VariableFont_wght"
    "Schibsted_Grotesk/SchibstedGrotesk-Italic-VariableFont_wght"
    "Space_Grotesk/SpaceGrotesk-VariableFont_wght"
)

# Check every source before writing anything: a half-converted directory that
# reports the mistake only at the end is a trap for the next reader.
missing=0
for face in "${FACES[@]}"; do
    if [[ ! -f "$SRC/$face.ttf" ]]; then
        echo "missing source: $SRC/$face.ttf" >&2
        missing=$((missing + 1))
    fi
done
if [[ "$missing" -gt 0 ]]; then
    echo "$missing source file(s) missing under $SRC — nothing was written." >&2
    exit 1
fi

total=0
for face in "${FACES[@]}"; do
    src="$SRC/$face.ttf"
    dst="$OUT/$face.woff2"
    mkdir -p "$(dirname "$dst")"
    pyftsubset "$src" \
        --unicodes="$UNICODES" \
        --layout-features="$FEATURES" \
        --name-IDs='*' \
        --flavor=woff2 \
        --output-file="$dst"
    size=$(stat -c%s "$dst")
    total=$((total + size))
    printf '%7d  %s\n' "$size" "$dst"
done

# A face removed from FACES must not keep its old file alive: it would still be
# in static/ and still be precached. Only files under $OUT are pruned.
stale=0
while IFS= read -r -d '' existing; do
    rel="${existing#"$OUT"/}"
    rel="${rel%.woff2}"
    keep=0
    for face in "${FACES[@]}"; do
        [[ "$face" == "$rel" ]] && { keep=1; break; }
    done
    if [[ "$keep" -eq 0 ]]; then
        echo "pruning stale output: $existing" >&2
        rm -f "$existing"
        stale=$((stale + 1))
    fi
done < <(find "$OUT" -name '*.woff2' -print0)

awk -v total="$total" -v faces="${#FACES[@]}" \
    'BEGIN { printf "\ntotal: %d bytes across %d faces (%.2f MiB)\n", total, faces, total / 1048576 }'
