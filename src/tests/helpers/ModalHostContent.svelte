<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program. If not, see <https://www.gnu.org/licenses/>.
-->

<!--
  Test fixture for BUG-0671 — the settings pane reduced to the one action that
  opens a confirmation dialog.

  Deliberately a real pane content component rendered by a real `settings`
  window and mounting the real `ConfirmActionModal`. The point of the test that
  uses it is that nothing between the click and the rendered frame is a
  stand-in; the only thing this file removes is the settings surface around it.

  Both callbacks close the dialog, so a test can tell "the press landed" (the
  dialog is gone) from "the press was refused" (it is still there).
-->
<script lang="ts">
    import ConfirmActionModal from "../../components/shared/ConfirmActionModal.svelte";

    let open = $state(false);
</script>

<button type="button" onclick={() => (open = true)}>Open confirm</button>

{#if open}
    <ConfirmActionModal
        isOpen={true}
        action="account-switch"
        facts={[
            { label: "Account", value: "Second" },
            { label: "Exchange", value: "Bitunix" },
        ]}
        onconfirm={() => (open = false)}
        oncancel={() => (open = false)}
    />
{/if}
