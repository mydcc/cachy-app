<!--
  BUG-0534 fixture — a financial conversion inside a component's <script>
  block, with no decimal.js import. The pre-fix script never walked .svelte at
  all, and an import gate would skip this file for the same reason: a
  component that converts a price with parseFloat does not import Decimal.
-->
<script lang="ts">
    let price = "";

    function half(value: string) {
        return parseFloat(value) / 2;
    }
</script>

<input bind:value={price} />
<span>{half(price)}</span>
