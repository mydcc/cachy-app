import re

def fix_braces(content):
    # Regex to find drawFunction bodies that end with a statement and then the object closer, missing the function closer.
    # We look for something like
    # We want to replace it with

    # Wait, the indentation was  (6 spaces).
    # Then  (2 spaces + closing brace + comma).

    # We want to insert  (6 spaces + closing brace) before the object closer.

    # Or simpler: find  and replace with

    # But let's be safer and target specific IDs.

    patterns_to_fix = [
        "headAndShoulders",
        "inverseHeadAndShoulders",
        "doubleTop",
        "doubleBottom",
        "tripleTop",
        "tripleBottom"
    ]

    for pid in patterns_to_fix:
        # Find the block for this ID
        start_regex = r'(id:\s*"' + pid + r'".*?drawFunction:\s*\(.*?\)\s*=>\s*\{)'
        match_start = re.search(start_regex, content, re.DOTALL | re.MULTILINE)
        if not match_start:
            print(f"Could not find start for {pid}")
            continue

        start_idx = match_start.start()

        # Find the end of this object definition
        # We look for  which closes the object.
        # But wait, since we missed the function brace, the parser sees  as the end of function? No.
        # My previous script replaced  which included the object closer.
        # And replaced it with  (no brace) +  (object closer).

        # So we have

        # We want to find the first occurrence of  after the start.
        # Or just look for  inside this block.

        block_end_regex = r'(\);\s*\}\,)'
        match_end = re.search(block_end_regex, content[start_idx:])

        if match_end:
            abs_end_start = start_idx + match_end.start()
            abs_end_end = start_idx + match_end.end()

            original_end = match_end.group(1) #
            # We want
            # Indentation:
            # drawText is indented 6 spaces.
            # function closing brace should be indented 4 spaces? No, 6 spaces to align with body? Or 4 spaces to align with ?
            #  is indented 4 spaces. So closing brace should be 4 spaces.
            # Object closing brace  is indented 2 spaces.

            new_end = ");\n    }\n  },"

            # Replace only this occurrence
            content = content[:abs_end_start] + new_end + content[abs_end_end:]
            print(f"Fixed {pid}")
        else:
            print(f"Could not find end for {pid}")

    return content

with open("src/services/chartPatterns.ts", "r") as f:
    content = f.read()

new_content = fix_braces(content)

with open("src/services/chartPatterns.ts", "w") as f:
    f.write(new_content)
