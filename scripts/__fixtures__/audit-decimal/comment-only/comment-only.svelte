<!--
  BUG-0534 fixture — a `.svelte` file whose only native conversions live in
  comments. The word must not become a violation just because the component was
  walked for the first time, in either comment form a component can carry that
  the repo's linter accepts.
-->
<script lang="ts">
    // Number(x) would be flagged here, but this is a comment.
    /* parseFloat(y) is also only a comment. */
    let value = 1;
</script>

<p>{value}</p>
<!-- Number(order.filled) in an HTML comment is not a call site either. -->
