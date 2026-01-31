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
import { windowManager } from "../lib/windows/WindowManager.svelte";
import { DialogWindow } from "../lib/windows/implementations/DialogWindow.svelte";
import { SymbolPickerWindow } from "../lib/windows/implementations/SymbolPickerWindow.svelte";

// Interface kept for backward compatibility if imported elsewhere,
// though the state itself is no longer active.
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
    // Legacy state container - effectively unused by new logic
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

      if (type === 'symbolPicker') {
          const win = new SymbolPickerWindow(resolve);
          windowManager.open(win);
      } else {
          const win = new DialogWindow(
              title,
              message,
              type as 'alert' | 'confirm' | 'prompt',
              defaultValue,
              resolve
          );
          windowManager.open(win);
      }
    });
  }

  handleModalConfirm(result: boolean | string) {
      // Deprecated: Logic is now handled within Window instances (DialogWindow/SymbolPickerWindow)
      console.warn("modalState.handleModalConfirm called but is deprecated.");
  }

  close() {
      // Deprecated
  }
}

export const modalState = new ModalManager();
