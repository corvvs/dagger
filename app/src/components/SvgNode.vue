<template lang="pug">
g.node(
  v-bind="node_bind"
)
  rect.nodebody.draggable(
      x="0" y="0"
      :width="node.width" :height="node.height"
      draggable
      @mousedown.stop="mouseDownBody($event)"
      @mouseenter.stop="mouseEnter($event)"
      @mouseleave.stop="mouseLeave($event)"
    )
  g(transform="translate(4,12)")
    text(v-for="(line,i) in format_svg_text_multiline(node.title)")
      tspan(x="0" :dy="i * 12") {{ line }}

  g.resizer(v-if="status.selected")
    rect.edge(v-for="rb in resizer_binds" :key="rb.resizeMode"
      :class="rb.class" :x="rb.x" :y="rb.y"
      :width="rb.width" :height="rb.height"
      fill="#111" stroke="none" draggable
      @mousedown.stop="mouseDownResizer($event, rb.resizeVertical, rb.resizeHorizontal)"
    )
  g.outer_edge(v-if="(status.overred && !status.selected) || status.link_targeted")
    rect.outer_edge_rect(
      :class=""
      :x="-8" :y="-8"
      :width="node.width+16" :height="node.height+16"
      fill="none"
    )
</template>

<script lang="ts">
import _ from "lodash";
import { reactive, ref, Ref, SetupContext, defineComponent, onMounted, PropType, watch, computed } from '@vue/composition-api';
import { Prop, Component, Vue } from 'vue-property-decorator';
import * as N from "@/models/network";
import * as F from "@/formatter"

const edgeWidth = 5;

export default defineComponent({
  props: {
    node: {
      type: Object as PropType<N.Network.Node>,
      required: true,
    },
    status: {
      type: Object as PropType<N.Network.NodeStatus>,
      required: true,
    },
  },

  setup(prop: {
    node: N.Network.Node;
    status: N.Network.NodeStatus;
  }, context: SetupContext) {
    return {
      ...F.useFormatter(),
      
      resizer_binds: computed(() => {
        const node = prop.node;
        return [
          { class: "n",                         x: node.width/2 - edgeWidth, resizeVertical: "n", y:               - edgeWidth },
          { class: "nw", resizeHorizontal: "w", x:              - edgeWidth, resizeVertical: "n", y:               - edgeWidth },
          { class: "w",  resizeHorizontal: "w", x:              - edgeWidth,                      y: node.height/2 - edgeWidth },
          { class: "sw", resizeHorizontal: "w", x:              - edgeWidth, resizeVertical: "s", y: node.height   - edgeWidth },
          { class: "s",                         x: node.width/2 - edgeWidth, resizeVertical: "s", y: node.height   - edgeWidth },
          { class: "se", resizeHorizontal: "e", x: node.width   - edgeWidth, resizeVertical: "s", y: node.height   - edgeWidth },
          { class: "e",  resizeHorizontal: "e", x: node.width   - edgeWidth,                      y: node.height/2 - edgeWidth },
          { class: "ne", resizeHorizontal: "e", x: node.width   - edgeWidth, resizeVertical: "n", y:               - edgeWidth },
        ].map(d => ({ ...d, width: 2 * edgeWidth, height: 2 * edgeWidth }))
      }),

      node_bind: computed(() => {
        const node = prop.node;
        const r: any = {
          class: [],
          transform: `translate(${node.x},${node.y})`,
        };
        if (prop.status.selected) {
          r.class.push("selected");
        } else if (prop.status.reachable_from_selected) {
          r.class.push("reachable-from-selected")
        } else if (prop.status.reachable_to_selected) {
          r.class.push("reachable-to-selected")
        }
        if (prop.status.link_targeted) {
          r.class.push("link_targeted")
        }
        if (!prop.status.selected && prop.status.not_linkable_from_selected) {
          r.class.push("not_linkable_from_selected")
        }
        if (prop.status.overred) {
          r.class.push("overred");
          if (prop.status.selected && !prop.status.linkable_from_selected) {
            r.class.push("nonlinkable")
          }
        }
        if (prop.status.source_sink) {
          r.class.push(`${prop.status.source_sink}`);
        }
        return r;
      }),

      // handlers
      mouseDownBody(event: MouseEvent) {
        const node = prop.node;
        context.emit("nodeMouseDownBody", { event, node });
      },

      mouseDownResizer(event: MouseEvent, resizeVertical?: "n" | "s", resizeHorizontal?: "w" | "e") {
        const node = prop.node;
        context.emit("nodeMouseDownResizer", { event, node, resizeVertical, resizeHorizontal });
      },

      mouseEnter(event: MouseEvent) {
        const node = prop.node;
        if (!prop.status.overred) {
          context.emit("nodeMouseEnter", { event, node });
        }
      },

      mouseLeave(event: MouseEvent) {
        const node = prop.node;
        if (prop.status.overred) {
          context.emit("nodeMouseLeave", { event, node });
        }
      },
    }
  }
});
</script>


<style scoped lang="stylus">
.node
  overflow hidden
  .nodebody
    fill white
    stroke #888
  // &.source .nodebody
  //   fill #efe
  // &.sink .nodebody
  //   fill #fee


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

  .outer_edge_rect
      stroke #888
    &.link_targeted
      stroke #f88
</style>
