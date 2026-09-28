<!--
  BUG-0534 fixture — the pressure valve. A native conversion in a component
  that is genuinely display-only, carrying the `audit: safe` marker with a
  reason. The marker is what makes an exemption reviewable, so the reason is
  part of what is being tested here.
-->
<script lang="ts">
    let ts = "0";

    function stamp(value: string) {
        return new Date(Number(value)).toISOString(); // audit: safe — epoch-ms timestamp, not a financial value
    }
</script>

<time>{stamp(ts)}</time>
