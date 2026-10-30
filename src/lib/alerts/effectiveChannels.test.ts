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

import { describe, it, expect } from "vitest";
import {
    channelSelection,
    effectiveChannels,
    isSilentSet,
    methodForChannel,
} from "./effectiveChannels";

const policyWantsAll = {
    wants: () => true,
    isActive: () => true,
    categorySilent: false,
};

describe("channelSelection", () => {
    it("treats an absent or unticked selection as no opinion", () => {
        expect(channelSelection(undefined)).toEqual({ local: undefined, external: undefined });
        expect(channelSelection([])).toEqual({ local: undefined, external: undefined });
    });

    it("splits local and external methods", () => {
        expect(channelSelection(["in_app", "email", "telegram"])).toEqual({
            local: ["in-app"],
            external: ["email", "telegram"],
        });
    });

    it("drops values this version does not know", () => {
        // A document from a newer build must not invent a channel.
        expect(channelSelection(["carrier_pigeon", "browser"])).toEqual({
            local: ["browser"],
            external: undefined,
        });
    });

    it("de-duplicates repeated methods", () => {
        expect(channelSelection(["discord", "discord"])).toEqual({
            local: undefined,
            external: ["discord"],
        });
    });
});

describe("effectiveChannels", () => {
    it("is empty for a category that is switched off entirely", () => {
        // `notify()` refuses before it reads the rule, so a rule tick cannot
        // resurrect a silenced category — and the footer must not claim it can.
        const effective = effectiveChannels(channelSelection(["browser"]), {
            ...policyWantsAll,
            categorySilent: true,
        });

        expect(effective).toEqual({ local: [], external: [] });
        expect(isSilentSet(effective)).toBe(true);
    });

    it("uses the rule's local picks and ignores the policy's locals", () => {
        const effective = effectiveChannels(channelSelection(["sound"]), policyWantsAll);

        expect(effective.local).toEqual(["sound"]);
    });

    it("falls back to the policy's locals when the rule selected none", () => {
        const effective = effectiveChannels(channelSelection(undefined), {
            wants: (channel) => channel !== "browser",
            isActive: () => true,
            categorySilent: false,
        });

        expect(effective.local).toEqual(["in-app", "sound"]);
    });

    it("narrows externals to the rule's picks", () => {
        const effective = effectiveChannels(channelSelection(["email"]), policyWantsAll);

        expect(effective.external).toEqual(["email"]);
    });

    it("never includes an external channel the policy does not want", () => {
        const effective = effectiveChannels(channelSelection(["discord"]), {
            wants: () => false,
            isActive: () => true,
            categorySilent: false,
        });

        expect(effective.external).toEqual([]);
    });

    it("never includes an external channel that is not active", () => {
        const effective = effectiveChannels(channelSelection(["discord"]), {
            wants: () => true,
            isActive: () => false,
            categorySilent: false,
        });

        expect(effective.external).toEqual([]);
    });

    it("once nothing is left, says so instead of claiming a channel", () => {
        const effective = effectiveChannels(channelSelection(undefined), {
            wants: () => false,
            isActive: () => false,
            categorySilent: false,
        });

        expect(isSilentSet(effective)).toBe(true);
    });
});

describe("methodForChannel", () => {
    it("maps the hyphenated in-app channel back to the trigger spelling", () => {
        expect(methodForChannel("in-app")).toBe("in_app");
        expect(methodForChannel("telegram")).toBe("telegram");
    });
});
