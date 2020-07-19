<template lang="pug">
.self(v-bind="self_bind")
  .panel
    .subpanel
      h4 Nodes
      v-btn(x-small @click="add_new_node()")
        v-icon add
        | New Node
      v-btn(x-small @click="align_nodes()")
        | Align
      v-btn(x-small @click="shift()")
        | Shift
  .status  {{ selection_mode || "(modeless)" }} {{ resizing_mode }}
  .svgs
    svg.svgmaster(
      @mousemove.stop="d_mm"
      @mouseup.stop="mup_field"
      @mousedown.stop="mdown_field"
    )
      g.field(
        :transform="field_transform"
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


    .node-panel(v-if="selected_node" :style="{ position: 'absolute', left: `${selected_node.x - 5 + field_offset.x}px`, top: `${selected_node.y - 40 + field_offset.y}px` }")
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
import anime from 'animejs'
const d3_dag = require("d3-dag");
console.log(d3_dag);

type LinkMap = {
  [key: string]: {
    [key: string]: D.GrabLink
  }
};

function makeGrabNode(overwrite: Partial<D.GrabNode> = {}) {
  return {
    id: uuid.v4(),
    title: "無題",
    width: 40,
    height: 30,
    x: 100,
    y: 100,
    z: 1,
    ...overwrite,
  }
}

function topological_sort(nodes: D.GrabNode[], link_map: LinkMap, reverse_link_map: LinkMap) {
  const node_map = _.keyBy(nodes, n => n.id);
  const sorted: D.GrabNode[] = [];
  const reverse_link_count = _.mapValues(reverse_link_map, v => Object.keys(v).length);
  console.log(reverse_link_count);
  let froms: D.GrabNode[] = nodes.filter(n => !reverse_link_count[n.id]);
  for(let i = 0; i < nodes.length; ++i) {
    const f = froms.shift();
    if (!f) { break; }
    console.log(f.title)
    sorted.push(f);
    if (!link_map[f.id]) { continue; }
    _.each(link_map[f.id], (link, t) => {
      reverse_link_count[t] -= 1;
      if (reverse_link_count[t]) { return; }
      froms.push(node_map[t]);
    });
  }
  return sorted;
}

function align(sorted_nodes: D.GrabNode[], link_map: LinkMap, reverse_link_map: LinkMap) {
  const node_map = _.keyBy(sorted_nodes, n => n.id);
  const stack: {
    [key: string]: {
      node: D.GrabNode;
      from?: D.GrabNode;
      x: number;
      y: number;
    }
  } = {};
  let tx = 0;
  let ty = 0;
  sorted_nodes.forEach(n => {
    if (!reverse_link_map[n.id]) {
      stack[n.id] = { node: n, x: 0, y: ty };
      ty += 1;
    } else {
      const fid = _.maxBy(Object.keys(reverse_link_map[n.id]), fid => stack[fid]!.x)!;
      const x = stack[fid]!.x + 1;
      if (x === tx) {
        ty += 1;
      } else {
        ty = 0;
      }
      tx = x;
      stack[n.id] = {
        node: n,
        from: node_map[fid],
        x,
        y: ty,
      };
    }
  });
  return stack;
}

function align_by_d3_dag(sorted_nodes: D.GrabNode[], link_map: LinkMap, reverse_link_map: LinkMap) {
  const dagger = d3_dag.dagStratify();
  const dag = dagger(
    sorted_nodes.map(n => ({
      id: n.id,
      parentIds: Object.keys(reverse_link_map[n.id] || {}),
    }))
  );
  let xmin = Infinity;
  let ymin = Infinity;
  let xmax = -Infinity;
  let ymax = -Infinity;
  sorted_nodes.forEach(n => {
    if (n.x < xmin) { xmin = n.x }
    if (n.y < ymin) { ymin = n.y }
    if (xmax < n.x) { xmax = n.x }
    if (ymax < n.y) { ymax = n.y }
  });
  const layouter = d3_dag.sugiyama(dag).nodeSize([60, 60]);
  console.log(layouter);
  layouter(dag);
  console.log(dag);

  let xmin2 = Infinity;
  let ymin2 = Infinity;
  let xmax2 = -Infinity;
  let ymax2 = -Infinity;
  const layout_map: { [key: string]: any } = {};
  function digger(node: any) {
    if (_.isArray(node.children)) {
      node.children.forEach(digger);
    }
    if (node.x < xmin2) { xmin2 = node.x }
    if (node.y < ymin2) { ymin2 = node.y }
    if (xmax2 < node.x) { xmax2 = node.x }
    if (ymax2 < node.y) { ymax2 = node.y }
    layout_map[node.id] = { x: node.x,  y: node.y };
  }
  digger(dag)
  const dw = xmax - xmin;
  const dh = ymax - ymin;
  console.log({ xmin, ymin, xmax, ymax })
  _.each(layout_map, (d, id) => {
    d.x += -xmin2 + xmin;
    d.y += -ymin2 + ymin;
  });
  return layout_map;
}

const nodeMinimum = {
  width: 30,
  height: 30,
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
    if (from.id === to.id) { return false; }
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
    // _.range(0, 80).forEach(i => {
    //   this.add_new_node({ title: `#${i+1}`, x: 50 + (i % L) * 120, y: 50 + Math.floor(i / L) * 120 })
    // });
    // _.range(13, 17).forEach(k => {
    //     _.range(k, this.nodes.length).forEach(i => {
    //       this.set_link(this.nodes[i-k], this.nodes[i])
    //     })
    // });
    const N = 20;
    _.range(0, N).forEach(i => {
      const r = (Math.random() * 0.3 + 0.7) * 300;
      const t = 2 * Math.PI / N * i;
      this.add_new_node({
        title: `#${i+1}`,
        x: 400 + r * Math.cos(t),
        y: 400 + r * Math.sin(t),
      });
    })
    _.range(0, N * 3).forEach(() => {
      const i = Math.floor(Math.random() * this.nodes.length);
      const j = Math.floor(Math.random() * this.nodes.length);
      this.set_link(this.nodes[i], this.nodes[j]);
    });
    this.flush_node_status_map()

  }

  get self_bind() {
    const r = {
      class: _.compact([
        this.selection_mode,
        this.resizing_mode,
        this.mdowning_field ? "dragging-field" : "",
      ]),
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
  /**
   * マウスカーソルの現在位置
   */
  cursor_offset: { x: number, y: number } | null = null;
  /**
   * ノードの内部座標系におけるオフセット値
   * = ノードの原点から見たオフセット位置の座標
   * リサイズ・移動に使う
   */
  inner_offset: { x: number, y: number } | null = null;
  /**
   * フィールドのオフセット値
   * = SVG座標系の原点から見た「現在のビューポートの原点に対応する位置」の座標
   */
  field_offset: { x: number, y: number } = { x: 0, y: 0 };
  get field_transform() {
    return `translate(${this.field_offset.x},${this.field_offset.y})`;
  }
  get anchored_point() {
    if (this.selection_mode === "link") {
      if (this.selected_node && this.over_node && this.linkable(this.selected_node, this.over_node)) {
        return {
          x: this.over_node.x + this.over_node.width/2,
          y: this.over_node.y + this.over_node.height/2,
        };
      }
    }
    return this.cursor_offset ? { x: this.cursor_offset.x - this.field_offset.x, y: this.cursor_offset.y - this.field_offset.y } : null;
  }

  /**
   * MouseMove
   */
  mm(event: MouseEvent) {
    // console.log(this)
    if (!this.selection_mode) {
      if (this.mdowning_field && this.cursor_offset) {
        // フィールド
        this.field_offset.x += event.clientX - this.cursor_offset.x;
        this.field_offset.y += event.clientY - this.cursor_offset.y;
        this.cursor_offset = { x: event.clientX, y: event.clientY }
      }
      return
    }
    const x = event.clientX, y = event.clientY;
    switch (this.selection_mode) {
      case "move": {
        const node = this.node_map[this.dragging_node_id];
        if (!node || !this.inner_offset) { return }
        node.x = x - this.inner_offset.x;
        node.y = y - this.inner_offset.y; 
        this.flip_node_to("front", node);
        this.update_links(node);
        break;
      }
      case "resize": {
        const node = this.node_map[this.dragging_node_id];
        if (!node) { return }
        if (this.cursor_offset) {
          const mx = x - this.cursor_offset.x;
          const my = y - this.cursor_offset.y;
          const ax = node.x + mx;
          const ay = node.y + my;
          this.indicator_message = JSON.stringify({ ...this.cursor_offset, mx, my, ax, ay });
          let touched_x = false;
          if (this.resizing_mode === "w" || this.resizing_mode === "nw" || this.resizing_mode === "sw") {
            const new_west_x = node.x + mx;
            const new_width = node.width - mx;
            if (nodeMinimum.width <= new_width) {
              node.x = new_west_x;
              node.width = new_width;
              touched_x = true;
            }
          } else if (this.resizing_mode === "e" || this.resizing_mode === "ne" || this.resizing_mode === "se") {
            const new_width = node.width + mx;
            if (nodeMinimum.width <= new_width) {
              node.width = new_width;
              touched_x = true;
            }
          }
          let touched_y = false
          if (this.resizing_mode === "n" || this.resizing_mode === "nw" || this.resizing_mode === "ne") {
            const new_north_y = node.y + my;
            const new_height = node.height - my;
            if (nodeMinimum.height <= new_height) {
              node.y = new_north_y;
              node.height = new_height;
              touched_y = true;
            }
          } else if (this.resizing_mode === "s" || this.resizing_mode === "sw" || this.resizing_mode === "se") {
            const new_height = node.height + my;
            if (nodeMinimum.height <= new_height) {
              node.height = new_height;
              touched_y = true;
            }
          }
          if (touched_x) {
            this.cursor_offset.x = x;
          }
          if (touched_y) {
            this.cursor_offset.y = y;
          }
          if (touched_x || touched_y) {
            this.update_links(node);
          }
        }
        break;
      }
      case "link": {
        this.cursor_offset = { x, y };
        break;
      }
    }
  }
  d_mm = _.throttle(this.mm, 17);


  mdowning_field = false

  /**
   * フィールド上 mousedown
   */
  mdown_field(event: MouseEvent) {
    if (this.selected_node_id) {
      this.selected_node_id = ""
      this.selection_mode = null
      this.resizing_mode = null
      this.flush_node_status_map()
    }
    this.mdowning_field = true
    this.cursor_offset = { x: event.clientX, y: event.clientY };
    this.indicator_message = JSON.stringify(this.cursor_offset);
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
      this.inner_offset = { x: event.clientX - node.x, y: event.clientY - node.y }; 
      const selected_node = this.selected_node;
      this.selection_mode = "move"
      this.selected_node_id = node.id
      this.resizing_mode = null
      this.flush_node_status_map()
    }
    this.cursor_offset = { x: event.clientX, y: event.clientY };
    this.indicator_message = JSON.stringify(this.cursor_offset);
  }

  mdown_node_resizer(arg: { event: MouseEvent, node: D.GrabNode, resizeMode: D.ResizeMode }) {
    // console.log(arg.event.type, this.selection_mode)
    const { event, node, resizeMode } = arg;
    this.dragging_node_id = node.id
    this.inner_offset = { x: event.clientX - node.x, y: event.clientY - node.y };
    this.selection_mode = "resize"
    this.selected_node_id = node.id
    this.resizing_mode = resizeMode
    this.set_node_status(node)
    this.cursor_offset = { x: event.clientX, y: event.clientY };
    this.indicator_message = JSON.stringify(this.cursor_offset);
  }

  mup_field(event: MouseEvent) {
    this.dragging_node_id = ""
    this.resizing_mode = null
    this.inner_offset = null;
    this.mdowning_field = false
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
      this.cursor_offset = null;
    }
    this.flush_node_status_map()
  }

  flip_node_to(to: "front" | "back", node: D.GrabNode) {
    const N = this.nodes.length;
    const i = this.nodes.findIndex(n => n.id === node.id);
    if (i < 0) { return }
    if (to === "back") {
      if (0 < i) {
        const [d] = this.nodes.splice(i, 1);
        this.nodes.splice(0, 0, d);
      }
    } else {
      if (i < N - 1) {
        const [d] = this.nodes.splice(i, 1);
        this.nodes.push(d);
      }
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

  link_map: LinkMap = {};

  update_all_links() {
    _.each(this.link_map, (submap, fid) => {
      _.each(submap, (link, tid)  => {
        this.link_binds[link.id] = this.link_bind(link);
      });
    });
  }

  /**
   * ノード　origin に出入りするリンクを更新する
   */
  update_links(origin: D.GrabNode) {
    if (this.link_map[origin.id]) {
      _.each(this.link_map[origin.id], link => this.link_binds[link.id] = this.link_bind(link))
      // _.each(this.link_map[origin.id], link => this.$set(this.link_binds, link.id, this.link_bind(link)));
    }
    if (this.reverse_link_map[origin.id]) {
      _.each(this.reverse_link_map[origin.id], link => this.link_binds[link.id] = this.link_bind(link));
      // _.each(this.reverse_link_map[origin.id], link => this.$set(this.link_binds, link.id, this.link_bind(link)));
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


  shift() {
    let t = 0;
    const animearg = { x: 0 };
    const sorted = topological_sort(this.nodes, this.link_map, this.reverse_link_map);
    // const alignment = this.align_nodes();
    // const displacement = _.mapValues(alignment, d => {
    //   return {
    //     node: d.node,
    //     dx: d.x * 50 + 50 - d.node.x,
    //     dy: d.y * 50 + 50 - d.node.y,
    //   };
    // });
    const layout_map = align_by_d3_dag(sorted, this.link_map, this.reverse_link_map);
    const displacement = _(sorted).map((n,i) => {
      const layout = layout_map[n.id];
      return {
        node: n,
        dx: layout.y - n.x,
        dy: layout.x - n.y,
      }
    }).keyBy(d => d.node.id).value();
    console.log(displacement);
    anime({
      targets: animearg,
      x: 100,
      round: 1,
      easing: 'easeOutExpo',
      duration: 400,
      update: () => {
        const t2 = animearg.x;
        this.nodes.forEach(node => {
          node.x += displacement[node.id]!.dx * (t2 - t) / 100;
          node.y += displacement[node.id]!.dy * (t2 - t) / 100;
        });
        t = t2;
        this.flush_node_status_map()
        this.update_all_links()
      }
    })
  }

  align_nodes() {
    const sorted = topological_sort(this.nodes, this.link_map, this.reverse_link_map);
    console.log(sorted.map(n => n.title));
    align_by_d3_dag(sorted, this.link_map, this.reverse_link_map);
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
  &.dragging-field
    cursor grab
    user-select none

  &.resize
    user-select none
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
