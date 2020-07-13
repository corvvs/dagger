<template lang="pug">
.self
  .svgs
    svg.svgmaster(@mousemove="mm"
      @mouseup="mu"
    )
      g.anchors
        g.anchor(v-for="(anchor, key) in anchors", :key="key")
          line(v-for="bind in link_bind(anchor)" v-bind="bind")

      g.nodes
        g.node(v-for="node in nodes" :key="node.id" :transform="`translate(${node.x},${node.y})`")
          rect(x="0" y="0" :width="node.width" :height="node.height" fill="#ddd" stroke="none"
          )
          g.nob
            rect.draggable(x="0" y="0" :width="node.width" :height="nob.height" fill="#aaa" stroke="none"
              draggable
              @mousedown="md($event, node)"
            )
            text(fill="#fff" transform="translate(4,20)") {{ node.title }}
          rect(x="0" y="0" :width="node.width" :height="node.height" fill="none" stroke="#333"
          )
          g.resizer(v-if="selected_node_id === node.id")
            rect.edge.n(:x="node.width/2 - edgeWidth" :y="-edgeWidth" :width="edgeWidth*2" :height="edgeWidth*2" fill="#111" stroke="none"
              draggable
              @mousedown="md($event, node, 'resize-n')"
            )
            rect.edge.s(:x="node.width/2 - edgeWidth" :y="node.height - edgeWidth" :width="edgeWidth*2" :height="edgeWidth*2" fill="#111" stroke="none"
              draggable
              @mousedown="md($event, node, 'resize-s')"
            )
            rect.edge.w(:x="-edgeWidth" :y="node.height/2 - edgeWidth" :width="edgeWidth*2" :height="edgeWidth*2" fill="#111" stroke="none"
              draggable
              @mousedown="md($event, node, 'resize-w')"
            )
            rect.edge.e(:x="node.width - edgeWidth" :y="node.height/2 - edgeWidth" :width="edgeWidth*2" :height="edgeWidth*2" fill="#111" stroke="none"
              draggable
              @mousedown="md($event, node, 'resize-e')"
            )
            rect.edge.nw(:x="-edgeWidth" :y="-edgeWidth" :width="edgeWidth*2" :height="edgeWidth*2" fill="#111" stroke="none"
              draggable
              @mousedown="md($event, node, 'resize-nw')"
            )
            rect.edge.sw(:x="-edgeWidth" :y="node.height - edgeWidth" :width="edgeWidth*2" :height="edgeWidth*2" fill="#111" stroke="none"
              draggable
              @mousedown="md($event, node, 'resize-sw')"
            )
            rect.edge.ne(:x="node.width - edgeWidth" :y="-edgeWidth" :width="edgeWidth*2" :height="edgeWidth*2" fill="#111" stroke="none"
              draggable
              @mousedown="md($event, node, 'resize-ne')"
            )
            rect.edge.se(:x="node.width - edgeWidth" :y="node.height - edgeWidth" :width="edgeWidth*2" :height="edgeWidth*2" fill="#111" stroke="none"
              draggable
              @mousedown="md($event, node, 'resize-se')"
            )


</template>

<script lang="ts">
import _ from "lodash";
import moment from "moment";
import { Prop, Component, Vue } from 'vue-property-decorator';
import firebase from "firebase";
import * as uuid from "uuid";
import * as U from "@/util";

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

type DraggingMode = "move"
  | "resize-n" | "resize-s" | "resize-w" | "resize-e"
  | "resize-nw" | "resize-se" | "resize-sw" | "resize-ne"

function makeGrabNode(overwrite: Partial<GrabNode> = {}) {
  return {
    id: uuid.v4(),
    title: "無題",
    width: 100,
    height: 200,
    x: 100,
    y: 100,
    z: 1,
    ...overwrite,
  }
}

const nodeMinimum = {
  width: 100,
  height: 100,
};

@Component({
  components: {
  }
})
export default class Draggable extends Vue {

  nob = {
    height: 30,
  };
  get edgeWidth() { return 4 }
  get arrowHeadLength() { return 15 }
  get arrowHeadRadian() { return 20 * Math.PI / 180; }

  nodes = [
    makeGrabNode({ title: "From", }),
    makeGrabNode({ title: "To", x: 220, y: 220, }),
  ];
  get nodemap() {
    return _.keyBy(this.nodes, node => node.id)
  }
  anchors: { [key: string]: GrabLink } = {};
  mounted() {
    const [from_id, to_id] = [this.nodes[0].id, this.nodes[1].id];
    this.$set(this.anchors, `${from_id}_${to_id}`, {
      from_id, to_id,
    })
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

  /**
   * Anchorの属性
   */
  link_bind(anchor: GrabLink): LinkBind[] {
    const node_from = this.nodemap[anchor.from_id];
    const node_to = this.nodemap[anchor.to_id];
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



    const link: LinkBind = {
      x1: c1.x,
      y1: c1.y,
      x2: c2.x,
      y2: c2.y,
      stroke: "#000",
    };
    return [
      link,
      ...this.link_arrow_binds(link, node_to),
    ]
  }

  /**
   * 「矢じり」
   */
  link_arrow_binds(link_bind: LinkBind, node_to: GrabNode): LinkBind[] {
    const { x1, y1, x2, y2 } = link_bind;
    const r = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const dx = (x1 - x2) / r * this.arrowHeadLength;
    const dy = (y1 - y2) / r * this.arrowHeadLength;

    const lines: LineParameter[] = [
      { x0: node_to.x, y0: node_to.y, x1: 1, y1: 0 },
      { x0: node_to.x, y0: node_to.y, x1: 0, y1: 1 },
      { x0: node_to.x + node_to.width, y0: node_to.y + node_to.height, x1: 1, y1: 0 },
      { x0: node_to.x + node_to.width, y0: node_to.y + node_to.height, x1: 0, y1: 1 },
    ];

    const delta = 0.001;
    const edge_lines = _(lines).map(w => crossing_point({
      x0: x1, y0: y1, x1: -dx, y1: -dy,
    }, w)).compact().filter(crossing => {
      return (crossing.x - node_to.x >= -delta)
          && (crossing.y - node_to.y >= -delta)
          && (node_to.x + node_to.width - crossing.x >= -delta)
          && (node_to.y + node_to.height - crossing.y >= -delta)
    }).sortBy(crossing => {
      return Math.pow(crossing.x - x1, 2) + Math.pow(crossing.y - y1, 2)
    }).value();
    if (edge_lines.length === 0) { return []; }
    const cx = edge_lines[0].x;
    const cy = edge_lines[0].y;
    const ax1 = dx * Math.cos(+this.arrowHeadRadian) - dy * Math.sin(+this.arrowHeadRadian);
    const ay1 = dx * Math.sin(+this.arrowHeadRadian) + dy * Math.cos(+this.arrowHeadRadian);
    const ax2 = dx * Math.cos(-this.arrowHeadRadian) - dy * Math.sin(-this.arrowHeadRadian);
    const ay2 = dx * Math.sin(-this.arrowHeadRadian) + dy * Math.cos(-this.arrowHeadRadian);
    return [
      {
        x1: cx, y1: cy,
        x2: cx + ax1, y2: cy + ay1,
        stroke: "#000",
      },
      {
        x1: cx, y1: cy ,
        x2: cx + ax2, y2: cy + ay2,
        stroke: "#000",
      },
    ];
  }


  selected_node_id: string = ""
  dragging_node_id: string = ""
  dragging_mode: DraggingMode | null = null
  mp: { x: number, y: number } | null = null
  mm(event: MouseEvent) {
    const node = this.nodemap[this.dragging_node_id];
    if (!node || !this.mp) { return }
    const x = event.offsetX, y = event.offsetY;
    if (this.dragging_mode === "move") {
      node.x += event.movementX;
      node.y += event.movementY;
    }
    if (this.dragging_mode === "resize-n" || this.dragging_mode === "resize-nw" || this.dragging_mode === "resize-ne") {
      const hy = node.y + node.height;
      const minimumy = hy - nodeMinimum.height
      if (y <= minimumy) {
        node.y = y
        node.height = hy - y
      }
    }
    if (this.dragging_mode === "resize-w" || this.dragging_mode === "resize-nw" || this.dragging_mode === "resize-sw") {
      const hx = node.x + node.width;
      const minimumx = hx - nodeMinimum.width;
      if (x <= minimumx) {
        node.x = x
        node.width = hx - x
      }
    }
    if (this.dragging_mode === "resize-e" || this.dragging_mode === "resize-ne" || this.dragging_mode === "resize-se") {
      if (x - node.x >= nodeMinimum.width) {
        node.width = x - node.x
      }
    }
    if (this.dragging_mode === "resize-s" || this.dragging_mode === "resize-sw" || this.dragging_mode === "resize-se") {
      if (y - node.y >= nodeMinimum.height) {
        node.height = y - node.y;
      }
    }
  }

  md(event: MouseEvent, node: GrabNode, mode: DraggingMode = "move") {
    console.log(node)
    this.dragging_node_id = node.id
    this.mp = { x: event.offsetX, y: event.offsetY };
    this.dragging_mode = mode
    this.selected_node_id = node.id
    console.log("down", mode)
  }

  mu(event: MouseEvent) {
    this.dragging_node_id = ""
    this.mp = null;
    console.log("up")
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
.svgs
  flex-shrink 1
  flex-grow 1
  display flex
  width 100%

  .svgmaster
    border 1px solid black
    height 100%
    width 100%
    overflow hidden

.draggable
  cursor grab
.node
  .nob
    overflow hidden
  .edge
    opacity 1
    fill white
    stroke #888
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
