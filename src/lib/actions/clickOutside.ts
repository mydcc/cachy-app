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

export function clickOutside(
  node: HTMLElement,
  { enabled, callback }: { enabled: boolean; callback: () => void },
) {
  function handleClick(event: MouseEvent) {
    if (
      enabled &&
      node &&
      !node.contains(event.target as Node) &&
      !event.defaultPrevented
    ) {
      callback();
    }
  }

  document.addEventListener("click", handleClick, true);

  return {
    update({
      enabled: newEnabled,
      callback: newCallback,
    }: {
      enabled: boolean;
      callback: () => void;
    }) {
      enabled = newEnabled;
      callback = newCallback;
    },
    destroy() {
      document.removeEventListener("click", handleClick, true);
    },
  };
}
