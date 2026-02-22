#!/usr/bin/env python3
import os
import sys

# License Header Templates
LICENSE_TEXT = """Copyright (C) 2026 MYDCT

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>."""

HEADER_C = "/*\n * " + LICENSE_TEXT.replace("\n", "\n * ") + "\n */\n\n"
HEADER_HASH = "# " + LICENSE_TEXT.replace("\n", "\n# ") + "\n\n"
HEADER_HTML = "<!--\n  " + LICENSE_TEXT.replace("\n", "\n  ") + "\n-->\n\n"

# File Extension Mapping
EXTENSION_MAP = {
    ".ts": HEADER_C,
    ".js": HEADER_C,
    ".css": HEADER_C,
    ".scss": HEADER_C,
    ".py": HEADER_HASH,
    ".sh": HEADER_HASH,
    ".svelte": HEADER_HTML,
    ".html": HEADER_HTML,
}

# Directories to Exclude
EXCLUDE_DIRS = {
    "node_modules",
    ".git",
    ".svelte-kit",
    ".vscode",
    "dist",
    "build",
    "coverage",
    "test-results",
    "static", # Often contains assets or 3rd party libs
    ".github"
}

# Files to Exclude explicitly (if any source files should be skipped)
EXCLUDE_FILES = {
    "vite.config.ts", # Config files often don't need headers, but let's include them if they are source.
    "svelte.config.js",
    "playwright.config.js",
    "eslint.config.js",
    "postcss.config.js",
    "tailwind.config.js"
}
# Actually, config files are code, so they should probably have headers if we are strict.
# But often they are just boilerplate. The prompt says "alle Dateien und neu erstellte Dateien".
# I will include config files too, but maybe skip very specific ones if they break.
# Re-reading prompt: "alle Dateien...". I'll be inclusive.
EXCLUDE_FILES = set() # Empty for now.

def has_license_header(content):
    # Check for a unique substring of the license
    return "GNU Affero General Public License" in content

def process_file(filepath, header_style):
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            lines = f.readlines()

        content = "".join(lines)

        if has_license_header(content):
            print(f"Skipping (already has license): {filepath}")
            return

        print(f"Adding license to: {filepath}")

        # Handle Shebang
        if lines and lines[0].startswith("#!"):
            # Insert after the shebang
            new_content = lines[0] + "\n" + header_style + "".join(lines[1:])
        else:
            new_content = header_style + content

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(new_content)

    except Exception as e:
        print(f"Error processing {filepath}: {e}")

def main():
    root_dir = os.getcwd()

    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Filter directories in-place
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]

        for filename in filenames:
            ext = os.path.splitext(filename)[1]
            if ext in EXTENSION_MAP:
                if filename in EXCLUDE_FILES:
                    continue

                filepath = os.path.join(dirpath, filename)
                process_file(filepath, EXTENSION_MAP[ext])

if __name__ == "__main__":
    main()
