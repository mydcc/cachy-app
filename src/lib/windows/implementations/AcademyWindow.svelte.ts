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
  Copyright (C) 2026 MYDCT
  Trading Academy as its own window type (FEAT-0045), rather than a `modal`
  routed through ModalFrame -- minimisable, its geometry persists across a
  reload, and it coexists with other windows instead of blocking them.
*/

import { WindowBase } from "../WindowBase.svelte";
import AcademyContent from "../../../components/shared/AcademyContent.svelte";

export class AcademyWindow extends WindowBase {
    constructor(title: string = "Trading Academy") {
        super({ title, windowType: "academy" });
    }

    get component() {
        return AcademyContent;
    }
}
