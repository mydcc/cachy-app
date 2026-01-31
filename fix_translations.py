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


import json
import os

paths = ['src/locales/locales/en.json', 'src/locales/locales/de.json']

for path in paths:
    if not os.path.exists(path):
        print(f"File not found: {path}")
        continue

    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    modified = False

    # Move cloud from settings to root
    if 'settings' in data and 'cloud' in data['settings']:
        cloud_data = data['settings'].pop('cloud')
        data['cloud'] = cloud_data
        print(f"Moved cloud from settings to root in {path}")
        modified = True
    elif 'cloud' not in data:
         # If not in settings and not in root, it's missing entirely (unlikely based on my read)
         print(f"Warning: 'cloud' key not found in settings or root of {path}")

    # Fix the missing EN key 'dashboard.takeProfitTargets.emptyState' if we are processing EN
    if path.endswith('en.json'):
         # It might be missing
         if 'dashboard' in data and 'takeProfitTargets' in data['dashboard']:
             if 'emptyState' not in data['dashboard']['takeProfitTargets']:
                 data['dashboard']['takeProfitTargets']['emptyState'] = "No targets defined. Add a target above."
                 print("Added missing dashboard.takeProfitTargets.emptyState to en.json")
                 modified = True

    if modified:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
