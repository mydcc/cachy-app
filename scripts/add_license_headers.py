import os

LICENSE_TEXT_RAW = """Copyright (C) 2026 MYDCT

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

def get_commented_header(extension):
    lines = LICENSE_TEXT_RAW.split('\n')
    if extension in ['.ts', '.js', '.css', '.scss', '.less', '.java', '.c', '.cpp']:
        # Block comment /* ... */
        header = "/*\n"
        for line in lines:
            if line.strip() == "":
                 header += " *\n"
            else:
                 header += " * " + line + "\n"
        header += " */\n"
        return header
    elif extension in ['.svelte', '.html', '.xml']:
        # HTML comment <!-- ... -->
        header = "<!--\n"
        for line in lines:
            header += "  " + line + "\n"
        header += "-->\n"
        return header
    elif extension in ['.py', '.sh', '.yaml', '.yml', '.rb']:
        # Hash comment # ...
        header = ""
        for line in lines:
            header += "# " + line + "\n"
        return header
    return None

EXTENSIONS = {'.ts', '.js', '.css', '.scss', '.less', '.svelte', '.html', '.py', '.sh'}
SKIP_DIRS = {'.git', 'node_modules', 'dist', 'build', '.svelte-kit', '.vscode', 'test-results', 'coverage'}

def process_file(filepath):
    _, ext = os.path.splitext(filepath)
    if ext not in EXTENSIONS:
        return

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Skipping binary or unreadable file: {filepath}")
        return

    # FIX: Case insensitive check
    if "gnu affero general public license" in content.lower():
        # Already has license
        return

    # Extra check for "Copyright (C)" just in case
    if "copyright (c)" in content.lower() and "mydct" in content.lower():
        return

    header = get_commented_header(ext)
    if not header:
        return

    # Handle Shebang for scripts
    if content.startswith("#!"):
        lines = content.split('\n', 1)
        shebang = lines[0]
        rest = lines[1] if len(lines) > 1 else ""
        new_content = shebang + "\n\n" + header + "\n" + rest
    else:
        new_content = header + "\n" + content

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Added license to: {filepath}")

def main():
    root_dir = "."
    for dirpath, dirnames, filenames in os.walk(root_dir):
        # Filter directories
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

        for filename in filenames:
            filepath = os.path.join(dirpath, filename)
            process_file(filepath)

if __name__ == "__main__":
    main()
