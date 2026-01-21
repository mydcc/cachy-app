/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

class JulesManager {
  isVisible = $state(false);
  message = $state("");
  isLoading = $state(false);

  showReport(message: string) {
    this.isVisible = true;
    this.message = message;
    this.isLoading = false;
  }

  hideReport() {
    this.isVisible = false;
    this.message = "";
  }

  setLoading(isLoading: boolean) {
    this.isLoading = isLoading;
  }

  reset() {
    this.isVisible = false;
    this.message = "";
    this.isLoading = false;
  }
}

export const julesState = new JulesManager();
