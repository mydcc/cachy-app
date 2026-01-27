export class ExternalLinkService {
  private static instance: ExternalLinkService;
  private windows: Map<string, Window> = new Map();

  private constructor() {}

  public static getInstance(): ExternalLinkService {
    if (!ExternalLinkService.instance) {
      ExternalLinkService.instance = new ExternalLinkService();
    }
    return ExternalLinkService.instance;
  }

  /**
   * Opens a URL in a new window or focuses the existing window if it's already open.
   * @param url The URL to open.
   * @param key A unique key to identify the window context (e.g., "tv_BTCUSDT").
   */
  public openOrFocus(url: string, key: string): void {
    const existingWindow = this.windows.get(key);

    if (existingWindow && !existingWindow.closed) {
      existingWindow.focus();
    } else {
      // Open new window. We use 'key' as the window name as well,
      // though we primarily rely on the JS reference.
      const newWindow = window.open(url, key);
      if (newWindow) {
        this.windows.set(key, newWindow);
      }
    }
  }
}

export const externalLinkService = ExternalLinkService.getInstance();
