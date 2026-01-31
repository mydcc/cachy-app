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

# Note: In a production environment with dependencies, we would use:
# from google.oauth2 import service_account
# import google.auth.transport.requests

def main():
    print("--- Jules API OAuth 2.0 Test ---")

    # 1. Check for Credentials File
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not creds_path:
        print("\n[ERROR] GOOGLE_APPLICATION_CREDENTIALS environment variable not set.")
        print("Please set it to the path of your Service Account JSON file.")
        print("Example: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json")
        sys.exit(1)

    if not os.path.exists(creds_path):
        print(f"\n[ERROR] File not found at: {creds_path}")
        sys.exit(1)

    print(f"Found credentials file: {creds_path}")
    print("Note: This script requires the 'google-auth' library to generate a token.")
    print("If you see an ImportError below, please install it: pip install google-auth")

    try:
        from google.oauth2 import service_account
        import google.auth.transport.requests
        import google.auth

        print("\nAuthenticating...")
        # Scopes for Jules API (assuming generic cloud platform scope or specific jules scope)
        # Using cloud-platform is the safest bet for generic Google APIs unless documented otherwise
        SCOPES = ['https://www.googleapis.com/auth/cloud-platform']

        creds = service_account.Credentials.from_service_account_file(
            creds_path, scopes=SCOPES
        )

        # Refresh the token
        auth_req = google.auth.transport.requests.Request()
        creds.refresh(auth_req)

        token = creds.token
        print(f"Access Token generated (starts with: {token[:10]}...)")

        # 2. Test Connection (List Sources)
        url = "https://jules.googleapis.com/v1alpha/sources"
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }

        print(f"\nConnecting to {url}...")

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
                else:
                    print("\n[SUCCESS] Connection successful (Authenticated), but no sources found.")

            except json.JSONDecodeError:
                print("Response was not JSON:")
                print(data.decode('utf-8'))

    except ImportError:
        print("\n[CRITICAL] 'google-auth' library not found.")
        print("To run this OAuth test, you must install the Google Auth library:")
        print("  pip install google-auth requests")
        sys.exit(1)

    except Exception as e:
        print(f"\n[ERROR] {str(e)}")

if __name__ == "__main__":
    main()
