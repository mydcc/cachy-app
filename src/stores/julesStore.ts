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

import { writable } from "svelte/store";

interface JulesState {
  isVisible: boolean;
  message: string;
  isLoading: boolean;
}

const initialState: JulesState = {
  isVisible: false,
  message: "",
  isLoading: false,
};

function createJulesStore() {
  const { subscribe, update, set } = writable<JulesState>(initialState);

  return {
    subscribe,
    showReport: (message: string) =>
      update((state) => ({
        ...state,
        isVisible: true,
        message,
        isLoading: false,
      })),
    hideReport: () =>
      update((state) => ({ ...state, isVisible: false, message: "" })),
    setLoading: (isLoading: boolean) =>
      update((state) => ({ ...state, isLoading })),
    reset: () => set(initialState),
  };
}

export const julesStore = createJulesStore();
