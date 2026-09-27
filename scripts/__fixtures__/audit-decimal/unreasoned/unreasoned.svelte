<!--
  BUG-0534 fixture — a marker with no reason. The reason is the entire point
  of the exemption: without it the marker is an unreviewable claim, and an
  unreviewable claim is what this script exists to prevent. So a bare marker
  is its own failure, distinct from an unmarked violation.
-->
<script lang="ts">
    let volume = "0";

    function width(value: string) {
        return Number(value); /* audit: safe */
    }
</script>

<div style="width: {width(volume)}%"></div>
