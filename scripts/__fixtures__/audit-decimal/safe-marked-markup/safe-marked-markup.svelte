<!--
  BUG-0534 fixture — the pressure valve in *markup*. A line comment is not a
  comment inside a template, and an HTML comment is not valid inside a tag's
  attribute list, so a conversion in a template expression needs a block
  comment inside its braces. This fixture is what keeps the marker
  recognisable in that position.
-->
<script lang="ts">
    let realized = "0";
</script>

<span class:text-success={Number(realized) > 0 /* audit: safe — display-only sign test */}>
    {realized}
</span>
