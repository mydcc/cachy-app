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

/*
 * Copyright (C) 2026 MYDCT
 */

import { browser } from "$app/environment";

export interface ModalState {
  title: string;
  message: string;
  type: "alert" | "confirm" | "prompt" | "symbolPicker";
  defaultValue?: string;
  isOpen: boolean;
  resolve: ((value: boolean | string) => void) | null;
  extraClasses?: string;
}

class ModalManager {
  state = $state<ModalState>({
    title: "",
    message: "",
    type: "alert",
    defaultValue: "",
    isOpen: false,
    resolve: null,
    extraClasses: "",
  });

  show(
    title: string,
    message: string,
    type: "alert" | "confirm" | "prompt" | "symbolPicker",
    defaultValue: string = "",
    extraClasses: string = "",
  ): Promise<boolean | string> {
    return new Promise((resolve) => {
      if (!browser) {
        console.warn("Modal cannot be shown in SSR environment.");
        resolve(false);
        return;
      }

      this.state = {
        title,
        message,
        type,
        defaultValue,
        isOpen: true,
        resolve,
        extraClasses,
      };
    });
  }

  handleModalConfirm(result: boolean | string) {
    if (this.state.resolve) {
      this.state.resolve(result);
    }
    this.close();
  }

  close() {
    this.state = {
      ...this.state,
      isOpen: false,
      resolve: null,
    };
  }
}

export const modalState = new ModalManager();
