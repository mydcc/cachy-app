import os

LICENSE_TEXT = """Copyright (C) 2026 MYDCT

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>."""

EXTENSIONS = {
    '.ts': 'block',
    '.js': 'block',
    '.css': 'block',
    '.scss': 'block',
    '.svelte': 'html',
    '.html': 'html',
    '.py': 'hash',
    '.sh': 'hash',
}

SKIP_DIRS = {'node_modules', '.git', '.svelte-kit', 'dist', 'coverage', 'test-results', 'info', 'docs', '.github', '.vscode', 'benchmarks'}

def get_commented_header(style):
    if style == 'block':
        return "/*\n" + "\n".join([" * " + line if line else " *" for line in LICENSE_TEXT.split('\n')]) + "\n */\n\n"
    elif style == 'html':
        return "<!--\n" + "\n".join(["  " + line for line in LICENSE_TEXT.split('\n')]) + "\n-->\n\n"
    elif style == 'hash':
        return "\n".join(["# " + line if line else "#" for line in LICENSE_TEXT.split('\n')]) + "\n\n"
    return ""

def process_file(filepath):
    _, ext = os.path.splitext(filepath)
    if ext not in EXTENSIONS:
        return

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except Exception as e:
        print(f"Skipping {filepath}: {e}")
        return

    if not lines and os.path.getsize(filepath) == 0:
        return

    # Check for shebang in any file (e.g. .js files can have it too)
    shebang = ""
    content_lines = lines
    if lines and lines[0].startswith("#!"):
        shebang = lines[0]
        content_lines = lines[1:]

    full_content = "".join(lines)

    # Check if license already exists (loose check)
    # Check in the first 4000 chars to be safe
    if "GNU Affero General Public License" in full_content[:4000] or "AGPL" in full_content[:4000]:
        # print(f"Skipping {filepath}: Already has license.")
        return

    print(f"Adding license to {filepath}")

    header = get_commented_header(EXTENSIONS[ext])

    new_content = shebang + header + "".join(content_lines)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)

def main():
    root_dirs = ['src', 'server', 'scripts', 'tests']
    # Also include root files if they match extension

    # Process root directories
    for root_dir in root_dirs:
        if not os.path.exists(root_dir):
            continue

        for root, dirs, files in os.walk(root_dir):
            # Modify dirs in-place to skip unwanted directories
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]

            for file in files:
                filepath = os.path.join(root, file)
                process_file(filepath)

    # Process root files separately
    for file in os.listdir('.'):
        if os.path.isfile(file):
             # Skip this script itself if it was in the root (it's in scripts/ so it's covered above)
             process_file(file)

if __name__ == "__main__":
    main()
