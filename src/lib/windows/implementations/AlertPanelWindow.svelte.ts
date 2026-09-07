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

/**
 * FEAT-0389 — backing WindowBase for the Super-Alert side panel.
 *
 * Docks to the right edge on open instead of centring: the panel replaces a
 * modal whose whole defect was covering the chart the trader was reading. It
 * stays draggable and resizable from there — docking is a starting position,
 * not a cage — and WindowBase's own persistence restores wherever the trader
 * last left it.
 */

import { WindowBase } from "../WindowBase.svelte";
import AlertPanelView from "../../../components/alerts/AlertPanelView.svelte";

export interface AlertPanelWindowOptions {
  title: string;
  /** Symbol the panel opens on. Defaults to the active trade symbol. */
  symbol?: string;
  onclose?: () => void;
}

/** Gap to the viewport edge, so the panel reads as docked and not clipped. */
const EDGE_MARGIN_PX = 12;

export class AlertPanelWindow extends WindowBase {
  private _onCloseCallback?: () => void;
  private _symbol?: string;

  constructor(options: AlertPanelWindowOptions) {
    super({ title: options.title, windowType: "alertpanel" });
    this._onCloseCallback = options.onclose;
    this._symbol = options.symbol;
    if (!this.hasPersistedPosition()) {
      this.dockRight();
    }
  }

  /**
   * Matches WindowBase's own persistence key (`cachy_win_${id}` in
   * localStorage, see WindowBase.svelte.ts) -- not a key of this class's
   * own invention, so it actually detects what restoreState() will find.
   */
  private hasPersistedPosition(): boolean {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem(`cachy_win_${this.id}`);
  }

  /**
   * Positions the panel against the right edge on first open.
   *
   * Guarded on `window` because WindowBase is constructed in unit tests and
   * during SSR, where there is no viewport to dock against; the registry
   * defaults then stand and the first client render clamps them.
   */
  private dockRight() {
    if (typeof window === "undefined") return;
    this.x = Math.max(
      EDGE_MARGIN_PX,
      window.innerWidth - this.width - EDGE_MARGIN_PX,
    );
    this.y = EDGE_MARGIN_PX;
  }

  get component() {
    return AlertPanelView;
  }

  get componentProps() {
    return {};
  }

  /** Fires the caller's onclose however the window closed — X, Escape, or
   *  a programmatic `windowManager.close()`. */
  destroy() {
    super.destroy();
    this._onCloseCallback?.();
  }
}
