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
    if (!data || !Array.isArray(data) || data.length === 0) {
      return JSON.stringify(data);
    }

    // Optimization: If small array, stringify directly (faster than chunking overhead)
    if (data.length <= chunkSize) {
      return JSON.stringify(data);
    }

    const chunks: string[] = ["["];
    const total = data.length;

    for (let i = 0; i < total; i += chunkSize) {
      // Yield to event loop to unblock main thread
      await new Promise((resolve) => setTimeout(resolve, 0));

      const end = Math.min(i + chunkSize, total);
      // Slice is shallow copy of references
      const chunk = data.slice(i, end);

      const chunkStr = JSON.stringify(chunk);

      // Remove outer brackets []
      if (chunkStr.length > 2) {
          const content = chunkStr.slice(1, -1);
          // If not the first chunk, add a comma separator
          if (i > 0) {
            chunks.push(",");
          }
          chunks.push(content);
      }
    }

    chunks.push("]");
    return chunks.join("");
  }
};
