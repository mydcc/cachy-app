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
import { writable } from "svelte/store";
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

const modalState = writable<ModalState>({
  title: "",
  message: "",
  type: "alert",
  defaultValue: "",
  isOpen: false,
  resolve: null,
  extraClasses: "",
});

export const modalManager = {
  show(
    title: string,
    message: string,
    type: "alert" | "confirm" | "prompt" | "symbolPicker",
    defaultValue: string = "",
    extraClasses: string = "",
  ): Promise<boolean | string> {
    return new Promise((resolve) => {
      if (!browser) {
        // Only show modal in browser environment
        console.warn("Modal cannot be shown in SSR environment.");
        resolve(false); // Or handle as appropriate for your app
        return;
      }

      modalState.set({
        title,
        message,
        type,
        defaultValue,
        isOpen: true,
        resolve,
        extraClasses,
      });
    });
  },
  _handleModalConfirm(result: boolean | string) {
    const currentModalState = get(modalState);
    if (currentModalState.resolve) {
      currentModalState.resolve(result);
    }
    modalState.set({ ...currentModalState, isOpen: false, resolve: null });
  },
  subscribe: modalState.subscribe,
};
