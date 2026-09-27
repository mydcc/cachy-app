<!--
  BUG-0571 fixture — conversions passed by reference inside a component's
  script block. A bare function reference is the same conversion with the
  syntax on the other side of the identifier, and the old call-only pattern
  never saw it.
-->
<script lang="ts">
    let prices: string[] = [];
    let rows: string[] = [];

    const amounts = prices.map(Number);
    const values = rows.map(parseFloat);
</script>

<span>{amounts.length} / {values.length}</span>
