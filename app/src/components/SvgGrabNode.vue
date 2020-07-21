<template lang="pug">
g.node(
  v-bind="node_bind"
)
  rect.nodebody.draggable(
      x="0" y="0"
      :width="node.width" :height="node.height"
      stroke="#888"
      draggable
      @mousedown.stop="mdn_body($event)"
      @mouseenter.stop="men($event)"
      @mouseleave.stop="mle($event)"
      @click="$emit('click', $event)"
    )
  text(transform="translate(4,20)") {{ node.title }}

  g.resizer(v-if="status.selected")
    rect.edge(v-for="rb in resizer_binds" :key="rb.resizeMode"
      :class="rb.resizeMode" :x="rb.x" :y="rb.y"
      :width="rb.width" :height="rb.height"
      fill="#111" stroke="none" draggable
      @mousedown.stop="mdn_resizer($event, rb.resizeMode)"
    )
  g.link_target(v-if="status.link_targeted")
    rect.link_target_rect(
      :x="-5" :y="-5"
      :width="node.width+10" :height="node.height+10"
      fill="none"
      stroke="#f88"
    )
</template>

<script lang="ts">
import _ from "lodash";
import { Prop, Component, Vue } from 'vue-property-decorator';
import * as D from "@/models/draggable";

const edgeWidth = 5;

@Component({
  components: {
  }
})
export default class SvgGrabNode extends Vue {
  @Prop() node!: D.GrabNode;
  @Prop() status!: D.GrabNodeStatus;

  get resizer_binds() {
    const node = this.node;
    return [
      { resizeMode: "n",  x: node.width/2 - edgeWidth, y: -edgeWidth },
      { resizeMode: "nw", x: -edgeWidth,               y: -edgeWidth },
      { resizeMode: "w",  x: -edgeWidth,               y: node.height/2 - edgeWidth },
      { resizeMode: "sw", x: -edgeWidth,               y: node.height - edgeWidth },
      { resizeMode: "s",  x: node.width/2 - edgeWidth, y: node.height - edgeWidth },
      { resizeMode: "se", x: node.width - edgeWidth,   y: node.height - edgeWidth },
      { resizeMode: "e",  x: node.width - edgeWidth,   y: node.height/2 - edgeWidth },
      { resizeMode: "ne", x: node.width - edgeWidth,   y: -edgeWidth },
    ].map(d => ({ ...d, width: 2 * edgeWidth, height: 2 * edgeWidth }))
  }

  get node_bind() {
    const node = this.node;
    const r: any = {
      class: [],
      transform: `translate(${node.x},${node.y})`,
    };
    if (this.status.selected) {
      r.class.push("selected");
    } else if (this.status.reachable_from_selected) {
      r.class.push("reachable-from-selected")
    } else if (this.status.reachable_to_selected) {
      r.class.push("reachable-to-selected")
    }
    if (!this.status.selected && this.status.not_linkable_from_selected) {
      r.class.push("not_linkable_from_selected")
    }
    if (this.status.overred) {
      r.class.push("over");
      if (this.status.selected && !this.status.linkable_from_selected) {
        r.class.push("nonlinkable")
      }
    }
    return r;
  }

  /**
   * MouseDown(Body)
   * -> grabMouseDownBody
   */
  mdn_body(event: MouseEvent) {
    const node = this.node;
    this.$emit("grabMouseDownBody", { event, node });
  }

  /**
   * MouseDown(Resizer)
   * -> grabMouseDownResizer
   */
  mdn_resizer(event: MouseEvent, resizeMode: D.ResizeMode) {
    const node = this.node;
    this.$emit("grabMouseDownResizer", { event, node, resizeMode });
  }

  /**
   * MouseEnter
   * -> grabMouseEnter
   */
  men(event: MouseEvent) {
    const node = this.node;
    if (!this.status.overred) {
      this.$emit("grabMouseEnter", { event, node });
    }
  }

  /**
   * MouseLeave
   * -> grabMouseLeave
   */
  mle(event: MouseEvent) {
    const node = this.node;
    if (this.status.overred) {
      this.$emit("grabMouseLeave", { event, node });
    }
  }
}
</script>


<style scoped lang="stylus">
.node
  overflow hidden
  .nodebody
    fill white
  text
    fill black
    user-select none
    pointer-events none
  &.reachable-from-selected .nodebody
    fill lightyellow
  &.reachable-to-selected .nodebody
    fill lightyellow
  &.not_linkable_from_selected
    cursor not-allowed
    opacity 0.5
  .edge
    opacity 1
    fill white
    stroke #888

  .resizer .edge
    &.n
      cursor n-resize
    &.s
      cursor s-resize
    &.w
      cursor w-resize
    &.e
      cursor e-resize
    &.nw
      cursor nw-resize
    &.ne
      cursor ne-resize
    &.se
      cursor se-resize
    &.sw
      cursor sw-resize
</style>
