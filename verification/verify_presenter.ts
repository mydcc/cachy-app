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


import { TechnicalsPresenter } from "./src/utils/technicalsPresenter";

console.log("Format NaN:", TechnicalsPresenter.formatVal(NaN));
console.log("Format 0:", TechnicalsPresenter.formatVal(0));
console.log("Calc Width NaN:", TechnicalsPresenter.calculateBollingerBandWidth(NaN, NaN, NaN));
console.log("Calc Width 0:", TechnicalsPresenter.calculateBollingerBandWidth(100, 100, 100)); // Should be 0
console.log("Format Width(NaN):", TechnicalsPresenter.formatVal(TechnicalsPresenter.calculateBollingerBandWidth(NaN, NaN, NaN), 2));
console.log("Format Width(0):", TechnicalsPresenter.formatVal(TechnicalsPresenter.calculateBollingerBandWidth(100, 100, 100), 2));
