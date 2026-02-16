/**
 * Asynchronous JSON serialization service
 * Breaks large serialization tasks into chunks to unblock the main thread.
 */
export const serializationService = {
  /**
   * Async JSON stringify for large arrays.
   * Yields to the event loop between chunks.
   *
   * @param data Array of objects to stringify
   * @param chunkSize Number of items per chunk (default: 500)
   * @returns Promise resolving to JSON string
   */
  async stringifyAsync<T>(data: T[], chunkSize = 500): Promise<string> {
    // Fast path for invalid inputs or empty arrays
    if (!data || !Array.isArray(data) || data.length === 0) {
      return JSON.stringify(data);
    }

    // Optimization: If small array, stringify directly (faster than chunking overhead)
    if (data.length <= chunkSize) {
      return JSON.stringify(data);
    }

    const chunks: string[] = ["["];
    const total = data.length;

    try {
      for (let i = 0; i < total; i += chunkSize) {
        // Yield to event loop to unblock main thread
        await new Promise((resolve) => setTimeout(resolve, 0));

        const end = Math.min(i + chunkSize, total);
        const chunk = data.slice(i, end);

        // Institutional Grade Safety:
        // Instead of string slicing valid JSON (which is risky if implementation changes),
        // we manually map and join for maximum control, OR verify the structure.
        // Given performance requirements, we stick to JSON.stringify but with strict verification.
        const chunkStr = JSON.stringify(chunk);

        if (!chunkStr.startsWith('[') || !chunkStr.endsWith(']')) {
           throw new Error("Serialization integrity check failed: chunk is not a valid JSON array");
        }

        // Remove outer brackets [] safely
        // [1,2] -> 1,2
        // [] -> (empty)
        if (chunkStr.length > 2) {
            const content = chunkStr.slice(1, -1);
            if (i > 0) {
              chunks.push(",");
            }
            chunks.push(content);
        }
      }
    } catch (e) {
      console.error("Serialization failed", e);
      // Fallback to blocking serialization in worst case to ensure data delivery?
      // Or fail hard? For financial data, failing hard is better than corrupt data.
      throw e;
    }

    chunks.push("]");
    return chunks.join("");
  }
};
