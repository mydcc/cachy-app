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
#   unicode-range — the app ships de and en only, so latin + latin-ext covers
#                   every character either locale can render. The ranges are
#                   the ones Google Fonts uses for the same two subsets.
#   features      — ccmp/locl for correct locale forms, kern/liga/clig/calt for
#                   normal text shaping, case for all-caps runs, tnum/zero for
#                   the tabular numbers used in tables and price fields. The
#                   stylistic sets (ss01-ss08, cv01-cv14, salt, aalt) are
#                   dropped: nothing in src/ sets font-feature-settings or
#                   font-variant-alternates, so no UI path can reach them.
#                   Variable axes are kept — the @font-face weight ranges and
#                   font-optical-sizing depend on them.
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
UNICODES="U+0000-00FF,U+0100-024F,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2000-206F,U+20A0-20AB,U+20AC,U+2113,U+2122,U+2191,U+2193,U+2212,U+2215,U+A720-A7FF,U+FEFF,U+FFFD"
FEATURES="ccmp,locl,kern,liga,clig,calt,case,tnum,zero"

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

missing=0
total=0
for face in "${FACES[@]}"; do
    src="$SRC/$face.ttf"
    if [[ ! -f "$src" ]]; then
        echo "missing source: $src" >&2
        missing=$((missing + 1))
        continue
    fi
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

if [[ "$missing" -gt 0 ]]; then
    echo "$missing source file(s) missing under $SRC — nothing was deleted, fix the input and re-run." >&2
    exit 1
fi

awk -v total="$total" -v faces="${#FACES[@]}" \
    'BEGIN { printf "\ntotal: %d bytes across %d faces (%.2f MiB)\n", total, faces, total / 1048576 }'
