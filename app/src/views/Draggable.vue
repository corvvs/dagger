<template lang="pug">
.self(:class="selection_mode || ''")
  .panel
    .subpanel
      h4 Nodes
      v-btn(x-small @click="add_new_node")
        v-icon add
        | New Node
  .status  {{ selection_mode || "(modeless)" }} {{ resizing_mode }}
  .svgs
    svg.svgmaster(
      @mousemove="mm"
      @mouseup="mu"
      @mousedown.stop="md($event, null, null)"
    )
      g.anchors
        template(v-for="(submap, from_key) in link_map")
          g.anchor(v-for="(anchor, to_key) in submap", :key="`${from_key}_${to_key}`")
            SvgArrow(v-bind="link_bind(anchor)")

      g.nodes
        g.node(v-for="node in nodes" :key="node.id"
          v-bind="node_bind(node)"
        )
          rect.nodebody.draggable(x="0" y="0" :width="node.width" :height="node.height" stroke="#333"
              draggable
              @mousedown.stop="md($event, node, 'move')"
              @mouseenter.stop="men($event, node)"
              @mouseleave.stop="mle($event, node)"
            )
          text(transform="translate(4,20)") {{ node.title }}

          g.resizer(v-if="selected_node_id === node.id")
            rect.edge.n(:x="node.width/2 - edgeWidth" :y="-edgeWidth" :width="edgeWidth*2" :height="edgeWidth*2" fill="#111" stroke="none"
              draggable
              @mousedown.stop="md($event, node, 'resize', 'n')"
            )
            rect.edge.s(:x="node.width/2 - edgeWidth" :y="node.height - edgeWidth" :width="edgeWidth*2" :height="edgeWidth*2" fill="#111" stroke="none"
              draggable
              @mousedown.stop="md($event, node, 'resize', 's')"
            )
            rect.edge.w(:x="-edgeWidth" :y="node.height/2 - edgeWidth" :width="edgeWidth*2" :height="edgeWidth*2" fill="#111" stroke="none"
              draggable
              @mousedown.stop="md($event, node, 'resize', 'w')"
            )
            rect.edge.e(:x="node.width - edgeWidth" :y="node.height/2 - edgeWidth" :width="edgeWidth*2" :height="edgeWidth*2" fill="#111" stroke="none"
              draggable
              @mousedown.stop="md($event, node, 'resize', 'e')"
            )
            rect.edge.nw(:x="-edgeWidth" :y="-edgeWidth" :width="edgeWidth*2" :height="edgeWidth*2" fill="#111" stroke="none"
              draggable
              @mousedown.stop="md($event, node, 'resize', 'nw')"
            )
            rect.edge.sw(:x="-edgeWidth" :y="node.height - edgeWidth" :width="edgeWidth*2" :height="edgeWidth*2" fill="#111" stroke="none"
              draggable
              @mousedown.stop="md($event, node, 'resize', 'sw')"
            )
            rect.edge.ne(:x="node.width - edgeWidth" :y="-edgeWidth" :width="edgeWidth*2" :height="edgeWidth*2" fill="#111" stroke="none"
              draggable
              @mousedown.stop="md($event, node, 'resize', 'ne')"
            )
            rect.edge.se(:x="node.width - edgeWidth" :y="node.height - edgeWidth" :width="edgeWidth*2" :height="edgeWidth*2" fill="#111" stroke="none"
              draggable
              @mousedown.stop="md($event, node, 'resize', 'se')"
            )
        g.linker(v-if="selection_mode === 'link' && selected_node && anchored_point")
            SvgArrow(
              style="pointer-events: none;"
              :x1="selected_node.x + selected_node.width/2" :y1="selected_node.y + selected_node.height/2"
              :x2="anchored_point.x" :y2="anchored_point.y" stroke="red"
            )


    .node-panel(v-if="selected_node" :style="{ position: 'absolute', left: `${selected_node.x}px`, top: `${selected_node.y - 30}px` }")
      v-btn(small icon
        @click="start_linking(selected_node)"
        :color="selection_mode === 'link' ? 'info' : 'grey'"
        dark
        title="リンク"
      )
        v-icon(
        dark
        ) link
      v-btn(small icon
        @click="flip_to('front', selected_node)"
        title="最前面へ"
      )
        v-icon flip_to_front
      v-btn(small icon
        @click="flip_to('back', selected_node)"
        title="最背面へ"
      )
        v-icon flip_to_back
  .indicator
    | {{ indicator_message }}
</template>

<script lang="ts">
import _ from "lodash";
import moment from "moment";
import { Prop, Component, Vue } from 'vue-property-decorator';
import firebase from "firebase";
import * as uuid from "uuid";
import * as U from "@/util";
import SvgArrow from "@/components/SvgArrow.vue";

type LineParameter = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function crossing_point(v: LineParameter, w: LineParameter) {
  // s = ( (v0.x - w0.x) * w1.y - (v0.y - w0.y) * w1.x) ) / (v1.x * w1.y - v1.y * w1.x)
  const sd = (v.y0 - w.y0) * w.x1 - (v.x0 - w.x0) * w.y1;
  const sn = (v.x1 * w.y1 - v.y1 * w.x1);
  const s = sd / sn;
  return _.isFinite(s) ? {
    x: v.x0 + v.x1 * s,
    y: v.y0 + v.y1 * s,
  } : null;
}

function collision_point(vector: Vector, node: GrabNode) {
  const r = Math.sqrt(Math.pow(vector.c2.x - vector.c1.x, 2) + Math.pow(vector.c2.y - vector.c1.y, 2));
  const dx = (vector.c1.x - vector.c2.x) / r;
  const dy = (vector.c1.y - vector.c2.y) / r;

  const lines: LineParameter[] = [
    { x0: node.x, y0: node.y, x1: 1, y1: 0 },
    { x0: node.x, y0: node.y, x1: 0, y1: 1 },
    { x0: node.x + node.width, y0: node.y + node.height, x1: 1, y1: 0 },
    { x0: node.x + node.width, y0: node.y + node.height, x1: 0, y1: 1 },
  ];

  const epsilon = 0.001;
  const edge_lines = _(lines).map(w => crossing_point({
    x0: vector.c1.x, y0: vector.c1.y, x1: -dx, y1: -dy,
  }, w)).compact().filter(crossing => {
    return (crossing.x - node.x >= -epsilon)
        && (crossing.y - node.y >= -epsilon)
        && (node.x + node.width - crossing.x >= -epsilon)
        && (node.y + node.height - crossing.y >= -epsilon)
  }).sortBy(crossing => {
    return Math.pow(crossing.x - vector.c1.x, 2) + Math.pow(crossing.y - vector.c1.y, 2)
  }).value();
  if (edge_lines.length === 0) { return null; }
  return {
    x: edge_lines[0].x,
    y: edge_lines[0].y,
  };
}

type Point = {
  x: number;
  y: number;
}

type Vector = {
  c1: Point;
  c2: Point;
};

type GrabNode = {
  id: string;
  title: string;
  width: number;
  height: number;
  x: number;
  y: number;
  z: number;
};

type GrabLink = {
  from_id: string;
  to_id: string;
};

type LinkBind = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
}

type ResizeMode = "n" | "w" | "s" | "e"
  | "nw" | "sw" | "se" | "ne";

type SelectionMode = "move" | "resize" | "link";

function makeGrabNode(overwrite: Partial<GrabNode> = {}) {
  return {
    id: uuid.v4(),
    title: "無題",
    width: 100,
    height: 60,
    x: 100,
    y: 100,
    z: 1,
    ...overwrite,
  }
}

const nodeMinimum = {
  width: 50,
  height: 50,
};

@Component({
  components: {
    SvgArrow,
  }
})
export default class Draggable extends Vue {

  indicator_message = "";

  nob = {
    height: 30,
  };
  get edgeWidth() { return 5 }
  get arrowHeadLength() { return 15 }
  get arrowHeadRadian() { return 20 * Math.PI / 180; }

  nodes: GrabNode[] = [];
  get node_map() {
    return _.keyBy(this.nodes, node => node.id)
  }

  add_new_node() {
    const n = this.nodes.length + 1;
    this.nodes.push(makeGrabNode({ title: `#${n}`, x: 100 + 50*n, y: 100 + 80*n }));
  }

  linkable(from: GrabNode, to: GrabNode) {
    // **現在のグラフはDAGであると仮定する**

    // from -> to の辺があるとNG
    // (経路はあってもよい)
    if (this.link_map[from.id]) {
      if (this.link_map[from.id][to.id]) {
        return false;
      }
    }
    // to -> from の経路があるとNG
    // (もちろん辺もNG)
    const visited: { [key: string]: boolean } = {};
    let deps: { [key: string]: GrabNode } = { [to.id]: from };
    while (Object.keys(deps).length > 0) {
      const d2: { [key: string]: GrabNode } = {};
      for (const fid of Object.keys(deps)) {
        if (fid === from.id) {
          return false;
        }
        if (visited[fid]) {
          throw new Error("not a DAG")
        }
        visited[fid] = true;
        const submap = this.link_map[fid];
        if (submap) {
          for(const tid of Object.keys(submap)) {
            d2[tid] = this.node_map[tid];
          };
        }
      };
      deps = d2;
    }

    if (this.link_map[to.id]) {
      if (this.link_map[to.id][from.id]) {
        return false;
      }
    }
    return true;
  }

  set_link(from: GrabNode, to: GrabNode) {
    if (this.linkable(from, to)) {
      const submap = this.link_map[from.id]
      if (!submap || !submap[to.id]) {
        if (!submap) {
          this.$set(this.link_map, from.id , { });
        }
        this.$set(this.link_map[from.id], to.id, { from_id: from.id, to_id: to.id, });
      }
    } else {
      this.indicator_message = "duplicated link";
    }
  }

  link_map: {
      [key: string]: {
        [key: string]: GrabLink
      }
  } = {};

  get reverse_link_map() {
    const rm: {
      [key: string]: {
        [key: string]: GrabLink
      }
    } = {};
    _.each(this.link_map, (submap, from_key) => {
      _.each(submap,  (node, to_key) => {
        rm[to_key] = rm[to_key] || {};
        rm[to_key][from_key] = node;
      });
    });
    return rm;
  }

  mounted() {
    this.add_new_node()
    this.add_new_node()
    this.add_new_node()
    this.add_new_node()
    _.range(1, this.nodes.length).forEach(i => this.set_link(this.nodes[i-1], this.nodes[i]))
  }

  node_point(node: GrabNode, point: "n" | "s" | "w" | "e" | "nw" | "sw" | "ne" | "se") {
    const { x, y } = node
    const w = node.width;
    const h = node.height;
    switch (point) {
      case "n": return { x: x + w/2, y };
      case "s": return { x: x + w/2, y: y + h };
      case "w": return { x, y: y + h/2 };
      case "e": return { x: x + w, y: y + h/2 };
      case "nw": return { x, y };
      case "sw": return { x, y: y + h };
      case "ne": return { x: x + w, y };
      case "se": return { x: x + w, y: y + h };
    }
  }

  node_bind(node: GrabNode) {
    const r: any = {
      class: [],
      transform: `translate(${node.x},${node.y})`,
    };
    if (this.selected_node_id === node.id) {
      r.class.push("selected");
    }
    if (this.over_node && this.over_node.id === node.id) {
      r.class.push("over");
      if (this.selected_node && !this.linkable(this.selected_node, node)) {
        r.class.push("nonlinkable")
      }
    }
    return r;
  }

  /**
   * Anchorの属性
   */
  link_bind(anchor: GrabLink) {
    const node_from = this.node_map[anchor.from_id];
    const node_to = this.node_map[anchor.to_id];
    if (!node_from || !node_to) { return [] }

    // facing edge
    const c1 = {
      x: node_from.x + node_from.width / 2,
      y: node_from.y + node_from.height / 2,
    };

    const c2 = {
      x: node_to.x + node_to.width / 2,
      y: node_to.y + node_to.height / 2,
    };

    const cp1 = collision_point({ c1: c2, c2: c1 }, node_from);
    const cp2 = collision_point({ c1, c2 }, node_to);
    if (!cp1 || !cp2) { return {} }
    const link: LinkBind = {
      x1: cp1.x,
      y1: cp1.y,
      x2: cp2.x,
      y2: cp2.y,
      stroke: "#000",
    };
    return link;
  }

  selected_node_id: string = ""
  get selected_node() { return this.node_map[this.selected_node_id] }
  dragging_node_id: string = ""
  selection_mode: SelectionMode | null = null
  resizing_mode: ResizeMode | null = null
  over_node: GrabNode | null = null
  inner_offset: { x: number, y: number } | null = null
  offset: { x: number, y: number } | null = null;
  get anchored_point() {
    if (this.selection_mode === "link") {
      if (this.selected_node && this.over_node && this.linkable(this.selected_node, this.over_node)) {
        return {
          x: this.over_node.x + this.over_node.width/2,
          y: this.over_node.y + this.over_node.height/2,
        };
      }
    }
    return this.offset;
  }

  mm(event: MouseEvent) {
    const x = event.offsetX, y = event.offsetY;
    switch (this.selection_mode) {
      case "move": {
        const node = this.node_map[this.dragging_node_id];
        if (!node || !this.inner_offset) { return }
        node.x = x - this.inner_offset.x;
        node.y = y - this.inner_offset.y;
        break;
      }
      case "resize": {
        const node = this.node_map[this.dragging_node_id];
        if (!node) { return }
        if (this.resizing_mode === "n" || this.resizing_mode === "nw" || this.resizing_mode === "ne") {
          const hy = node.y + node.height;
          const minimumy = hy - nodeMinimum.height
          if (y <= minimumy) {
            node.y = y
            node.height = hy - y
          }
        }
        if (this.resizing_mode === "w" || this.resizing_mode === "nw" || this.resizing_mode === "sw") {
          const hx = node.x + node.width;
          const minimumx = hx - nodeMinimum.width;
          if (x <= minimumx) {
            node.x = x
            node.width = hx - x
          }
        }
        if (this.resizing_mode === "e" || this.resizing_mode === "ne" || this.resizing_mode === "se") {
          if (x - node.x >= nodeMinimum.width) {
            node.width = x - node.x
          }
        }
        if (this.resizing_mode === "s" || this.resizing_mode === "sw" || this.resizing_mode === "se") {
          if (y - node.y >= nodeMinimum.height) {
            node.height = y - node.y;
          }
        }
        break;
      }
      case "link": {
        this.offset = { x, y };
        break;
      }
    }
  }

  md(event: MouseEvent, node: GrabNode, mode: SelectionMode, resizeMode: ResizeMode) {
    if (!node) {
      this.selected_node_id = ""
      this.selection_mode = null
      this.resizing_mode = null
      return;
    }
    if (this.selection_mode === "link") {
      if (this.selected_node && this.linkable(this.selected_node, node)) {
        this.set_link(this.selected_node, node)
      }
    } else {
      this.dragging_node_id = node.id
      this.inner_offset = { x: event.offsetX - node.x, y: event.offsetY - node.y };
      this.selection_mode = mode
      this.selected_node_id = node.id
      this.resizing_mode = resizeMode
    }
  }

  mu(event: MouseEvent) {
    this.dragging_node_id = ""
    this.resizing_mode = null
    this.inner_offset = null;
  }

  men(event: MouseEvent, node: GrabNode) {
    if (!this.over_node || this.over_node.id !== node.id) {
      this.over_node = node
    }
  }

  mle(event: MouseEvent, node: GrabNode) {
    if (this.over_node && this.over_node.id === node.id) {
      // console.log(event)
      this.over_node = null
    }
  }

  start_linking(node: GrabNode) {
    if (this.selection_mode === "link") {
      this.selection_mode = null;
    } else {
      this.selected_node_id = node.id;
      this.selection_mode = "link";
      this.offset = null;
    }
  }

  flip_to(to: "front" | "back", node: GrabNode) {
    const i = this.nodes.findIndex(n => n.id === node.id);
    if (i < 0) { return }
    const [d] = this.nodes.splice(i, 1);
    if (to === "back") {
      this.nodes.splice(0, 0, d);
    } else {
      this.nodes.push(d);
    }
  }
}
</script>

<style scoped lang="stylus">
.self
  display flex
  flex-direction column
  position relative
  height 100%
  background-color #fff

.panel
  flex-shrink 0
  flex-grow 0
  display flex
.indicator
  flex-shrink 0
  flex-grow 0
.svgs
  flex-shrink 1
  flex-grow 1
  display flex
  width 100%
  position relative

  .svgmaster
    border 1px solid black
    height 100%
    width 100%
    overflow hidden
  .node-panel
    border 1px solid black
    background-color white
    opacity 0.75



.node
  overflow hidden
  .nodebody
    fill white
    text
      fill black
  .edge
    opacity 1
    fill white
    stroke #888

.self
  &.move .selected .draggable
    cursor grab

  &.resize, .self.move
    .edge
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

  &.link
    .node.over
      &:not(.selected)
        &:not(.nonlinkable) .nodebody
          fill #fee
          cursor pointer
        &.nonlinkable .nodebody
          cursor not-allowed
</style>
