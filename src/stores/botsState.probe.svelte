<script lang="ts">
  import { botsState } from "./botsState.svelte";

  const rows = $derived(
    [...botsState.states.entries()].map(
      ([id, life]) => `${id}:${life.state}:${life.hasPosition}`,
    ),
  );
</script>

<!--
  Test-only anchor for botsState.reactivityContract.component.test.ts —
  never imported by the app. It reads the projection exactly the way
  FEAT-0808's sidebar will: a derived over `botsState.states`, inside a
  mounted component's effect. That subscription is the thing the contract
  test exists to keep honest — an unowned read from a plain test file
  re-evaluates on every access and cannot see a stale cache.
-->
<ul data-testid="bots-state-probe">
  {#each rows as row (row)}
    <li>{row}</li>
  {/each}
</ul>
