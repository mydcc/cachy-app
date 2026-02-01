/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { browser } from "$app/environment";

class TimeService {
  now = $state(Date.now());
  private interval: any = null;

  constructor() {
    if (browser) {
      // Align to the start of the second for cleaner UI updates
      const delay = 1000 - (Date.now() % 1000);
      setTimeout(() => {
        this.now = Date.now();
        this.interval = setInterval(() => {
          this.now = Date.now();
        }, 1000);
      }, delay);
    }
  }

  destroy() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

export const timeService = new TimeService();

// HMR Cleanup
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    timeService.destroy();
  });
}
