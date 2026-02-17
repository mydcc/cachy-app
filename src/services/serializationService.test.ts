/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, it, expect } from 'vitest';
import { serializationService } from './serializationService';

describe('SerializationService', () => {
  it('should serialize a small array correctly', async () => {
    const data = [{ id: 1 }, { id: 2 }];
    const json = await serializationService.stringifyAsync(data);
    expect(json).toBe('[{"id":1},{"id":2}]');
  });

  it('should serialize a large array correctly (chunked)', async () => {
    // 600 items to force chunking (default 500)
    const data = Array.from({ length: 600 }, (_, i) => ({ id: i }));
    const json = await serializationService.stringifyAsync(data);

    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(600);
    expect(parsed[0].id).toBe(0);
    expect(parsed[599].id).toBe(599);
  });

  it('should handle empty arrays', async () => {
    const json = await serializationService.stringifyAsync([]);
    expect(json).toBe('[]');
  });
});
