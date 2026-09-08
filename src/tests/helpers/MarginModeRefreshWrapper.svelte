<script lang="ts">
  import { untrack } from "svelte";
  import MarginModeModal from "../../components/shared/MarginModeModal.svelte";

  type MarginMode = "ISOLATION" | "CROSS";
  type PositionMode = "ONE_WAY" | "HEDGE";

  let {
    onconfirm,
    initialMargin = undefined,
    initialPosition = undefined,
  }: {
    onconfirm: (changes: {
      marginMode?: MarginMode;
      positionMode?: PositionMode;
    }) => void;
    initialMargin?: MarginMode;
    initialPosition?: PositionMode;
  } = $props();

  let curMargin = $state<MarginMode | undefined>(untrack(() => initialMargin));
  let curPosition = $state<PositionMode | undefined>(untrack(() => initialPosition));

  let epoch = $state(0);

  /** Simulate the parent re-anchoring after a confirm attempt. */
  export function bump() {
    epoch += 1;
  }

  /** Simulate a broker refresh landing while the dialog is open. */
  export function refresh(margin: MarginMode | undefined, position: PositionMode | undefined) {
    curMargin = margin;
    curPosition = position;
  }
</script>

<MarginModeModal
  baseEpoch={epoch}
  currentMarginMode={curMargin}
  currentPositionMode={curPosition}
  marginReason=""
  positionReason=""
  busy={false}
  onclose={() => {}}
  {onconfirm}
/>
