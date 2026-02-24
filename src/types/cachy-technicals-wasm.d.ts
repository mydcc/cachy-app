/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

declare module "cachy-technicals-wasm" {
  export default function init(): Promise<void>;

  export class TechnicalsEngine {
    constructor();
    calculate_all(
      times: Float64Array,
      opens: Float64Array,
      highs: Float64Array,
      lows: Float64Array,
      closes: Float64Array,
      volumes: Float64Array,
      settingsJson: string
    ): string;
  }
}
