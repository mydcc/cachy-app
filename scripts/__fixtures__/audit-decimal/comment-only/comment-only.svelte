<!--
  BUG-0534 fixture — a `.svelte` file whose only native conversions live in
  comments. Both markup comment forms are covered: the word must not become a
  violation just because a component was walked for the first time.
-->
<script lang="ts">
    // Number(x) would be flagged here, but this is a comment.
    /* parseFloat(y) is also only a comment. */
    let value = 1;
</script>

<!-- Number(order.filled) in a markup comment is not a call site. -->
<p>{value}</p>
