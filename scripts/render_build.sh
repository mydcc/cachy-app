#!/bin/bash
# cachy-app
# Copyright (C) 2024 mydcc
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.

rm -rf node_modules package-lock.json
npm install --include=optional
npm run build
