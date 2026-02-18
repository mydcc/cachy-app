#!/usr/bin/env bash

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

# Exit on error
set -o errexit

echo "Build script started."

# Use pre-compiled WASM artifacts to speed up builds and avoid timeouts
# Skipping Rust installation and compilation on Render.
echo "Skipping WASM build (using artifacts)..."

echo "Installing Node dependencies..."
# Disable audit to speed up install and avoid audit errors
npm config set audit false

# Use npm install for robustness against platform-specific optional dependencies
# and lockfile mismatches, as recommended for Render deployments.
npm install

echo "Building..."
npm run build
