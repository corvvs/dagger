<template lang="pug">
.self(v-bind="self_bind")
  .panel
    .subpanel
      h4 Nodes
      v-btn(x-small @click="add_new_node()")
        v-icon add
        | New Node
  .status  {{ selection_mode || "(modeless)" }} {{ resizing_mode }}
  .svgs
    svg.svgmaster(
      @mousemove.stop="d_mm"
      @mouseup="mu_field"
      @mousedown.stop="mdown_field"
    )
      g.anchors
        g.anchor_from(v-for="(anchor, id) in link_dictionary" :key="id")
          SvgArrow(v-bind="link_binds[id]")

      g.nodes
        SvgGrabNode(v-for="node in nodes" :key="node.id"
          :node="node"
          :status="node_status_map[node.id]"
          @grabMouseDownBody="mdown_node"
          @grabMouseDownResizer="mdown_node_resizer"
          @grabMouseEnter="menter_node"
          @grabMouseLeave="mleave_node"
        )
        g.linker(v-if="selection_mode === 'link' && selected_node && anchored_point")
            SvgArrow(
              :x1="selected_node.x + selected_node.width/2" :y1="selected_node.y + selected_node.height/2"
              :x2="anchored_point.x" :y2="anchored_point.y" stroke="red"
            )


    .node-panel(v-if="selected_node" :style="{ position: 'absolute', left: `${selected_node.x - 5}px`, top: `${selected_node.y - 40}px` }")
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
        @click="flip_node_to('front', selected_node)"
        title="最前面へ"
      )
        v-icon flip_to_front
      v-btn(small icon
        @click="flip_node_to('back', selected_node)"
        title="最背面へ"
      )
        v-icon flip_to_back
      v-btn(small icon
        color="red"
        @click="delete_node(selected_node)"
        title="削除"
      )
        v-icon delete
  .indicator
    | {{ indicator_message }}
</template>

<script lang="ts">
import _ from "lodash";
import moment from "moment";
import { Prop, Component, Vue, Watch } from 'vue-property-decorator';
import firebase from "firebase";
import * as uuid from "uuid";
import * as U from "@/util";
import * as D from "@/models/draggable";
import SvgGrabNode from "@/components/SvgGrabNode.vue";
import SvgArrow from "@/components/SvgArrow.vue";


function makeGrabNode(overwrite: Partial<D.GrabNode> = {}) {
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
    SvgArrow, SvgGrabNode,
  }
})
export default class Draggable extends Vue {

  indicator_message = "";

  nodes: D.GrabNode[] = [];
  get node_map() {
    return _.keyBy(this.nodes, node => node.id)
  }

  node_status_map: { [key: string]: D.GrabNodeStatus } = {};
  node_status(node: D.GrabNode): D.GrabNodeStatus {
    const selected = this.selected_node_id === node.id;
    const linking = this.selection_mode === "link";
    const overred = !!(this.over_node && this.over_node.id === node.id);
    const linkable_from_selected = linking && this.linkable_from_selected(node);
    return {
      selected,
      overred,
      resizing: selected && this.selection_mode === "resize",
      reachable_from_selected: !!(this.reachable_map && this.reachable_map.from_selected[node.id]),
      reachable_to_selected: !!(this.reachable_map && this.reachable_map.to_selected[node.id]),
      linkable_from_selected,
      not_linkable_from_selected: linking && !this.linkable_from_selected(node),
      link_targeted: !!(!selected && linkable_from_selected && overred),
    };
  }
  flush_node_status_map() {
    this.node_status_map = {};
    this.nodes.forEach(node => this.set_node_status(node));
  }
  set_node_status(node: D.GrabNode) {
    this.$set(this.node_status_map, node.id, this.node_status(node))
  }

  add_new_node(arg: any = {}) {
    const n = this.nodes.length;
    this.nodes.push(makeGrabNode(arg));
  }

  /**
   * *node* から/へ到達可能なnodeの辞書を返す
   */
  reachable_nodes(dir: "from" | "to", origin_node: D.GrabNode) {
    const reachable_node: { [key: string]: number } = {}
    const neighboring_link: { [key: string]: D.GrabLink } = {}
    let deps: { [key: string]: D.GrabNode } = { [origin_node.id]: origin_node };
    const link_map = dir === "from" ? this.link_map : this.reverse_link_map;
    let distance = 0;
    while (Object.keys(deps).length > 0) {
      distance += 1;
      const d2: { [key: string]: D.GrabNode } = {};
      for (const fid of Object.keys(deps)) {
        // console.log(dir, fid, !!d2[fid])
        if (d2[fid]) { continue; }
        const submap = link_map[fid];
        if (submap) {
          for (const tid of Object.keys(submap)) {
            if (d2[tid] || reachable_node[tid]) { continue; }
            if (distance === 1) {
              const link = submap[tid];
              neighboring_link[`${link.from_id}_${link.to_id}`] = link;
            }
            d2[tid] = this.node_map[tid];
          };
        }
      };
      deps = d2;
      _.each(deps, (node, id) => reachable_node[id] = distance);
      // console.log(dir, Object.keys(deps));
    }
    return {
      reachable_node,
      neighboring_link,
    };
  }

  get reachable_map() {
    if (!this.selected_node) { return null }
    const from = this.reachable_nodes("from", this.selected_node)
    const to = this.reachable_nodes("to", this.selected_node)
    return {
      from_selected: from.reachable_node,
      from_neighboring_link: from.neighboring_link,
      to_selected: to.reachable_node,
      to_neighboring_link: to.neighboring_link,
    }
  }

  linkable_from_selected(to: D.GrabNode) {
    if (!this.selected_node || this.selection_mode !== "link" || !this.reachable_map) { return false; }
    if (this.selected_node.id === to.id) { return false; }
    if (this.reachable_map.to_selected[to.id]) { return false; }
    if (this.reachable_map.from_selected[to.id] <= 1) { return false; }
    return true;
  }

  linkable(from: D.GrabNode, to: D.GrabNode) {
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
    let deps: { [key: string]: D.GrabNode } = { [to.id]: from };
    while (Object.keys(deps).length > 0) {
      const d2: { [key: string]: D.GrabNode } = {};
      for (const fid of Object.keys(deps)) {
        if (fid === from.id) { return false; }
        if (visited[fid]) { continue; }
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

  mounted() {
    const L = 7;
    _.range(0, 400).forEach(i => {
      this.add_new_node({ title: `#${i+1}`, x: 50 + (i % L) * 120, y: 50 + Math.floor(i / L) * 120 })
    });
    _.range(13, 17).forEach(k => {
        _.range(k, this.nodes.length).forEach(i => {
          this.set_link(this.nodes[i-k], this.nodes[i])
        })
    });
    // _.range(0, this.nodes.length/2).forEach(i => this.set_link(this.nodes[i], this.nodes[i*2]))
    this.flush_node_status_map()
  }

  get self_bind() {
    const r = {
      class: _.compact([this.selection_mode, this.resizing_mode]),
    };
    return r;
  }

  link_binds: { [key: string]: any } = {};
  /**
   * Anchorの属性
   */
  link_bind(anchor: D.GrabLink) {
    // console.log(anchor.id, Date.now())
    const node_from = this.node_map[anchor.from_id];
    const node_to = this.node_map[anchor.to_id];
    if (!node_from || !node_to) { return {} }

    // facing edge
    const c1 = {
      x: node_from.x + node_from.width / 2,
      y: node_from.y + node_from.height / 2,
    };

    const c2 = {
      x: node_to.x + node_to.width / 2,
      y: node_to.y + node_to.height / 2,
    };

    const r = Math.pow(c2.x - c1.x, 2) + Math.pow(c2.y - c1.y, 2);
    if (!r) { return {} }
    const cp1 = D.collision_point({ c1: c2, c2: c1 }, node_from);
    const cp2 = D.collision_point({ c1, c2 }, node_to);
    if (!cp1 || !cp2) { return {} }
    const rp = Math.pow(cp2.x - cp1.x, 2) + Math.pow(cp2.y - cp1.y, 2);
    if (!rp) { return {} }
    return {
      name: anchor.id,
      x1: cp1.x,
      y1: cp1.y,
      x2: cp2.x,
      y2: cp2.y,
      arrowheadPosition: 0.8,
      stroke: this.reachable_map && (this.reachable_map.from_neighboring_link[anchor.id] || this.reachable_map.to_neighboring_link[anchor.id]) ? "black" : "#666",
    };
  }

  selected_node_id: string = ""
  get selected_node() { return this.node_map[this.selected_node_id] }
  dragging_node_id: string = ""
  selection_mode: D.SelectionMode | null = null
  resizing_mode: D.ResizeMode | null = null
  over_node: D.GrabNode | null = null
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

  /**
   * MouseMove
   */
  mm(event: MouseEvent) {
    // console.log(this)
    if (!this.selection_mode) { return }
    // console.log(event.target);
    // console.log(event.type, this.selection_mode)
    const x = event.offsetX, y = event.offsetY;
    switch (this.selection_mode) {
      case "move": {
        const node = this.node_map[this.dragging_node_id];
        if (!node || !this.inner_offset) { return }
        node.x = x - this.inner_offset.x;
        node.y = y - this.inner_offset.y;
        this.update_links(node);
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
  d_mm = _.throttle(this.mm, 17);

  mdown_field(event: MouseEvent) {
    this.selected_node_id = ""
    this.selection_mode = null
    this.resizing_mode = null
    this.flush_node_status_map()
  }

  mdown_node(arg: { event: MouseEvent, node: D.GrabNode }) {
    // console.log(arg.event.type, this.selection_mode)
    const { event, node } = arg;
    if (this.selection_mode === "link") {
      if (this.selected_node && this.linkable(this.selected_node, node)) {
        this.set_link(this.selected_node, node)
      }
    } else {
      this.dragging_node_id = node.id
      this.inner_offset = { x: event.offsetX - node.x, y: event.offsetY - node.y }; 
      const selected_node = this.selected_node;
      this.selection_mode = "move"
      this.selected_node_id = node.id
      this.resizing_mode = null
      this.flush_node_status_map()
    }
  }

  mdown_node_resizer(arg: { event: MouseEvent, node: D.GrabNode, resizeMode: D.ResizeMode }) {
    // console.log(arg.event.type, this.selection_mode)
    const { event, node, resizeMode } = arg;
    this.dragging_node_id = node.id
    this.inner_offset = { x: event.offsetX - node.x, y: event.offsetY - node.y };
    this.selection_mode = "resize"
    this.selected_node_id = node.id
    this.resizing_mode = resizeMode
    this.set_node_status(node)
  }

  mu_field(event: MouseEvent) {
    this.dragging_node_id = ""
    this.resizing_mode = null
    this.inner_offset = null;
  }

  menter_node(arg: { event: MouseEvent, node: D.GrabNode }) {
    // console.log(arg.event.type, this.selection_mode)
    const node = arg.node;
    if (this.selection_mode === "link") {
      if (!this.over_node || this.over_node.id !== node.id) {
        this.over_node = node
        this.set_node_status(node)
      }
    }
  }

  mleave_node(arg: { event: MouseEvent, node: D.GrabNode }) {
    // console.log(arg.event.type, this.selection_mode)
    const node = arg.node;
    if (this.over_node && this.over_node.id === node.id) {
      // console.log(event)
      this.over_node = null
      this.set_node_status(node)
    }
  }

  receive_grab(arg: any) {
    // console.log(arg)
  }

  start_linking(node: D.GrabNode) {
    if (this.selection_mode === "link") {
      this.selection_mode = null;
    } else {
      this.selected_node_id = node.id;
      this.selection_mode = "link";
      this.offset = null;
    }
    this.flush_node_status_map()
  }

  flip_node_to(to: "front" | "back", node: D.GrabNode) {
    const i = this.nodes.findIndex(n => n.id === node.id);
    if (i < 0) { return }
    const [d] = this.nodes.splice(i, 1);
    if (to === "back") {
      this.nodes.splice(0, 0, d);
    } else {
      this.nodes.push(d);
    }
  }

  set_link(from: D.GrabNode, to: D.GrabNode) {
    if (this.linkable(from, to)) {
      const submap = this.link_map[from.id]
      if (!submap || !submap[to.id]) {
        if (!submap) {
          this.$set(this.link_map, from.id , { });
        }
        const id = `${from.id}_${to.id}`;
        const link = {
          id,
          from_id: from.id,
          to_id: to.id,
        };
        this.$set(this.link_map[from.id], to.id, link);
        this.$set(this.link_dictionary, id, link);
        this.$set(this.link_binds, id, this.link_bind(link));
      }
    } else {
      this.indicator_message = "duplicated link";
    }
    this.flush_node_status_map()
  }

  link_dictionary: { [key: string]: D.GrabLink } = {}

  link_map: {
      [key: string]: {
        [key: string]: D.GrabLink
      }
  } = {};

  /**
   * ノード　origin に出入りするリンクを更新する
   */
  update_links(origin: D.GrabNode) {
    if (this.link_map[origin.id]) {
      _.each(this.link_map[origin.id], link => this.$set(this.link_binds, link.id, this.link_bind(link)));
    }
    if (this.reverse_link_map[origin.id]) {
      _.each(this.reverse_link_map[origin.id], link => this.$set(this.link_binds, link.id, this.link_bind(link)));
    }
  }

  @Watch("link_map")
  udt() {
    console.log(Date.now())
  }

  get reverse_link_map() {
    const rm: {
      [key: string]: {
        [key: string]: D.GrabLink
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

  delete_link(link: D.GrabLink) {
    this.$delete(this.link_dictionary, link.id);
    this.$delete(this.link_binds, link.id);
    this.$delete(this.link_map[link.from_id], link.to_id);
  }

  delete_node(node: D.GrabNode) {
    const i = this.nodes.findIndex(n => n.id === node.id);
    if (i < 0) { return }
    if (!confirm("このノードと、このノードに出入りするリンクを削除します。")) { return }
    if (this.link_map[node.id]) {
      _.each(this.link_map[node.id], (link) => this.delete_link(link));
    }
    if (this.reverse_link_map[node.id]) {
      _.each(this.reverse_link_map[node.id], (link) => this.delete_link(link));
    }
    this.$delete(this.node_status_map, node.id);
    this.nodes.splice(i, 1);
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
  overflow hidden

  .svgmaster
    border 1px solid black
    height 100%
    width 100%
  .node-panel
    border 1px solid black
    background-color white
    opacity 0.75


.self
  &.move .selected .draggable
    cursor grab

  &.resize
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
