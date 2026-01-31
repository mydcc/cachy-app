#!/usr/bin/env python3
# Copyright (C) 2026 MYDCT
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as
# published by the Free Software Foundation, either version 3 of the
# License, or (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

import os
import json
import sys
import urllib.request
import urllib.error

def main():
    print("--- Jules API Connection Test ---")

    # 1. Get API Key
    # Check JULES_API (from user screenshot) or JULES_API_KEY (standard convention)
    api_key = os.environ.get("JULES_API") or os.environ.get("JULES_API_KEY")

    if api_key:
        print(f"Loaded API Key from environment ({len(api_key)} chars).")
    else:
        print("Please enter your Jules API Key:")
        api_key = input("> ").strip()

    if not api_key:
        print("Error: No API Key provided.")
        sys.exit(1)

    # 2. Test Connection (List Sources)
    url = "https://jules.googleapis.com/v1alpha/sources"
    headers = {
        "X-Goog-Api-Key": api_key,
        "Content-Type": "application/json"
    }

    print(f"\nConnecting to {url}...")

    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as response:
            status_code = response.getcode()
            data = response.read()

            print(f"Status Code: {status_code}")

            try:
                json_data = json.loads(data)
                print("\nResponse Body:")
                print(json.dumps(json_data, indent=2))

                sources = json_data.get("sources", [])
                if sources:
                    print(f"\n[SUCCESS] Found {len(sources)} connected source(s).")
                    for s in sources:
                        print(f" - {s.get('name')} ({s.get('githubRepo', {}).get('owner')}/{s.get('githubRepo', {}).get('repo')})")
                else:
                    print("\n[SUCCESS] Connection successful, but no sources found.")
                    print("Note: You need to install the Jules GitHub App on a repo to see sources here.")

            except json.JSONDecodeError:
                print("Response was not JSON:")
                print(data.decode('utf-8'))

    except urllib.error.HTTPError as e:
        print(f"\n[ERROR] HTTP Error: {e.code} {e.reason}")
        error_body = e.read().decode('utf-8')
        print(f"Details: {error_body}")
    except urllib.error.URLError as e:
        print(f"\n[ERROR] Network Error: {e.reason}")
    except Exception as e:
        print(f"\n[ERROR] Unexpected Error: {str(e)}")

if __name__ == "__main__":
    main()
