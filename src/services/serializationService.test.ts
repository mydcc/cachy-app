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
