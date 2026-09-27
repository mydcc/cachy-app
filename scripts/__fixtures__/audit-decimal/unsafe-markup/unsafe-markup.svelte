<!--
  BUG-0534 fixture — a native conversion in a *markup* expression, not in a
  <script> block. The script scans whole lines, so markup is covered by the
  same rule; this fixture exists to prove that rather than to document it.
-->
<script lang="ts">
    let realized = "0";
</script>

<span class:text-success={Number(realized) > 0}>{realized}</span>
