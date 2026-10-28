import { beforeEach, describe, expect, it } from "vitest";
import { settingsState } from "../settings.svelte";
import { activeAccountLabel, activeAccountVenueLabel } from "./activeAccount";

function account(id: string, name: string, exchange: "bitunix" | "bitget") {
    return { id, name, exchange, keys: { key: "k", secret: "s" } };
}

describe("activeAccountLabel (FEAT-0378)", () => {
    beforeEach(() => {
        settingsState.accounts = [
            account("bu-1", "Main", "bitunix"),
            account("bg-1", "Scalp", "bitget"),
        ];
        settingsState.activeAccountId = "bu-1";
        settingsState.apiProvider = "bitunix";
    });

    it("names the account the gate signs for when the stored id is the other venue", () => {
        // `activeAccountFor` repairs a stored id that belongs to another
        // venue by falling back to the venue's first account. The chip must
        // show the same account the order gate will use, not the stored one.
        settingsState.activeAccountId = "bg-1";

        expect(activeAccountLabel()).toBe("Main");
    });

    it("falls back to the display-cased venue, not the provider slug", () => {
        settingsState.accounts = [];

        expect(activeAccountLabel()).toBe("Bitunix");
        expect(activeAccountVenueLabel()).toBe("Bitunix");
    });

    it("maps the bitget provider to its display name", () => {
        settingsState.apiProvider = "bitget";
        settingsState.activeAccountId = "bg-1";

        expect(activeAccountLabel()).toBe("Scalp");
        expect(activeAccountVenueLabel()).toBe("Bitget");
    });
});
