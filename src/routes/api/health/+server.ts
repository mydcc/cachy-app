/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { json } from '@sveltejs/kit';
import { APP_VERSION } from '#lib/version.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
    // No `environment` field: the health endpoint is unauthenticated, and
    // "development" / a deployment name tells a scanner which host it found
    // (BUG-0727). The version is already public in the release artifacts.
    const status = {
        status: 'ok',
        timestamp: Date.now(),
        version: APP_VERSION
    };

    return json(status);
};
