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

import { get } from "svelte/store";
import { settingsStore } from "../stores/settingsStore";

export const imgbbService = {
  async uploadToImgbb(file: File): Promise<string> {
    const settings = get(settingsStore);
    const apiKey = settings.imgbbApiKey;
    const expiration = settings.imgbbExpiration;

    if (!apiKey) {
      throw new Error(
        "Please configure your ImgBB API Key in Settings > API first.",
      );
    }

    const formData = new FormData();
    formData.append("image", file);

    // Handle expiration (API expects seconds)
    // If 0, we simply don't send the expiration parameter (default is permanent or user account setting)
    // Note: API documentation says "expiration" parameter is optional.
    let url = `https://api.imgbb.com/1/upload?key=${apiKey}`;
    if (expiration && expiration > 0) {
      url += `&expiration=${expiration}`;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("ImgBB API Error:", errorData);
        throw new Error(
          errorData?.error?.message ||
            `Upload failed with status ${response.status}`,
        );
      }

      const data = await response.json();
      if (data.success && data.data && data.data.url) {
        return data.data.url; // Return the direct link (or viewer link if preferred, user asked for direct path)
      } else {
        throw new Error("ImgBB response did not contain a URL.");
      }
    } catch (error) {
      console.error("ImgBB Upload Error:", error);
      throw error;
    }
  },
};
