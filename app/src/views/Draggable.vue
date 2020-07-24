<template lang="pug">
.self(v-bind="self_bind" v-if="dag")
  .mid_pane
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
              @click="receive_grab"
            )
            g.linker(v-if="selection_mode === 'link' && selected_node && anchored_point")
                SvgArrow(
                  :x1="selected_node.x + selected_node.width/2" :y1="selected_node.y + selected_node.height/2"
                  :x2="anchored_point.x" :y2="anchored_point.y" stroke="red"
                )


      .node-panel(v-if="selected_node" :style="{ left: `${selected_node.x - 5 + field_offset.x}px`, top: `${selected_node.y - 40 + field_offset.y}px` }")
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
  .right_pane
    h4 I/O
    h5 {{ dag.id }}
    .panel
      .subpanel
        v-btn(x-small :disabled="!dag_savable" :loading="dag_saving" @click="dag_save()")
          v-icon(small) cloud_upload
          | Save
        v-btn(x-small :disabled="!dag_savable" :loading="dag_saving" @click="dag_load()")
          v-icon(small) cloud_download
          | Load
    h4 Edit
    .panel
      .subpanel
        v-btn(x-small @click="add_new_node()")
          v-icon(small) add
          | New Node
        v-btn(x-small @click="align_nodes()" :disabled="animating")
          | Align
        v-btn(x-small @click="snap_on = !snap_on" :color="snap_on ? 'blue info' : ''")
          | Snap
      v-slider(v-model="field_zoom_level" label="Field Zoom" :min="-4" :max="4" step="0" :messages="`${field_zoom_level}`")
    .panel.status
      .line
        .name Selection Mode
        .value {{ selection_mode || "(nonse)" }}
      .line
        .name Selected Node
        .value {{ selected_node_id || "(none)" }}
      .line
        .name Resize Mode
        .value {{ resizing_mode || "(none)" }}
      .line
        .name Dragging Node
        .value {{ dragging_node_id || "(none)" }}
      .line
        .name Overred Node
        .value {{ over_node ? over_node.id : "(none)" }}
      .line
        .name Field Offset
        .value {{ field_offset || "(none)" }}
      .line
        .name Cursor Offset
        .value {{ cursor_offset || "(none)" }}
      .line
        .name Inner Offset
        .value {{ inner_offset || "(none)" }}
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

function makeGrabNode(overwrite: Partial<D.GrabNode> = {}) {
  return {
    id: `nd_${U.u_shorten_uuid(uuid.v4()).substring(0, 8)}`,
    title: "無題",
    width: 40,
    height: 30,
    x: 100,
    y: 100,
    z: 1,
    ...overwrite,
  }
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

  @Prop() user!: firebase.User | null;
  @Prop() dag_id!: string;
  dag: D.GrabDAG | null = null

  @Watch("user")
  @Watch("dag_id")
  async fetch() {
    console.log(this.user);
    if (this.user && this.dag_id) {
      const dag = await D.get_dag(this.user, this.dag_id);
      if (dag) {
        this.dag = dag as any;
      } else {
        this.dag = D.new_dag(this.dag_id);
      }
      this.nodes = this.dag!.nodes;
      this.link_map = this.dag!.links;
      this.link_dictionary = {};
      _(this.link_map).values().flatMap(submap => _.values(submap)).value().forEach(link => {
        this.$set(this.link_dictionary, link.id, link);
      })
      this.flush_node_status_map()
      this.update_all_links()
      return;
    }
    this.dag = null;
    this.nodes = [];
    this.link_map = {};
    this.link_dictionary = {};
    this.flush_node_status_map()
    this.update_all_links()
  }

  mounted() {
    this.fetch()
  }



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
    const is_source = !this.reverse_link_map[node.id];
    const is_sink = !this.link_map[node.id];
    return {
      selected,
      overred,
      resizing: selected && this.selection_mode === "resize",
      reachable_from_selected: !!(this.reachable_map && this.reachable_map.from_selected[node.id]),
      reachable_to_selected: !!(this.reachable_map && this.reachable_map.to_selected[node.id]),
      neighboring_with_selected: !!(this.reachable_map && this.reachable_map.to_neighboring_link[node.id]),
      linkable_from_selected,
      not_linkable_from_selected: linking && !this.linkable_from_selected(node),
      link_targeted: !!(!selected && linkable_from_selected && overred),
      source_sink: this.selected_node_id ? null : is_source ? "source" : is_sink ? "sink" : null,
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
    this.flush_node_status_map()
  }

  /**
   * *node* から/へ到達可能なnodeの辞書を返す
   */
  reachable_nodes(dir: "from" | "to", origin_node: D.GrabNode) {
    const reachable_node: { [key: string]: number } = {};
    const neighboring_node: { [key: string]: D.GrabNode } = {};
    const neighboring_link: { [key: string]: D.GrabLink } = {};
    const connected_link: { [key: string]: D.GrabLink } = {};
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
            const link = submap[tid];
            const link_id = link.id;
            if (distance === 1) {
              neighboring_link[link_id] = link;
              neighboring_node[tid] = this.node_map[tid];
            }
            connected_link[link_id] = link;
            if (reachable_node[tid]) { continue }
            d2[tid] = this.node_map[tid];
          };
        }
      };
      deps = d2;
      _.each(deps, (node, id) => reachable_node[id] = distance);
      // console.log(dir, Object.keys(deps));
    }
    // console.log(neighboring_link, connected_link)
    return {
      reachable_node,
      neighboring_node,
      neighboring_link,
      connected_link,
    };
  }

  get reachable_map() {
    if (!this.selected_node) { return null }
    const from = this.reachable_nodes("from", this.selected_node)
    const to = this.reachable_nodes("to", this.selected_node)
    return {
      from_selected: from.reachable_node,
      from_neighboring_link: from.neighboring_link,
      from_connected_link: from.connected_link,
      to_selected: to.reachable_node,
      to_neighboring_link: to.neighboring_link,
      to_connected_link: to.connected_link,
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

  // [Firebase I/O]
  private initiate() {
    this.dag = D.new_dag()
    this.nodes = this.dag.nodes;
    this.link_map = this.dag.links;
    const N = 30;
    const R = N * 50 * 1.2 / 2 / Math.PI;
    const L = 10;
    _.range(0, N).forEach(i => {
      const r = R;
      const t = 2 * Math.PI / N * i;
      this.add_new_node({
        title: `#${i+1}`,
        x: 10 + i % L * 80,
        y: 10 + Math.floor(i / L) * 80,
        // x: 400 + r * Math.cos(t),
        // y: 400 + r * Math.sin(t),
      });
    });
    _.range(0, N * 3).forEach(() => {
      const i = Math.floor(Math.random() * this.nodes.length);
      const j = Math.floor(Math.random() * this.nodes.length);
      this.set_link(this.nodes[i], this.nodes[j]);
    });
    this.flush_node_status_map()
  }

  get dag_savable() { return !!this.dag && !!this.user; }
  dag_saving = false;

  async dag_save() {
    if (!this.user) { return }
    if (!this.dag) { return }
    if (this.dag_saving) { return }
    try {
      this.dag_saving = true;
      this.dag.nodes = this.nodes;
      this.dag.links = this.link_map;
      await D.post_dag(this.user, this.dag);
    } catch (e) {
      console.error(e);
    }
    this.dag_saving = false;
  }

  async dag_load() {
    if (!this.user) { return }
    if (!confirm("前回の保存より後の編集結果を取り消し、サーバに保存されている状態に戻します")) { return }
    if (!this.dag) { return }
    if (this.dag_saving) { return }
    try {
      this.dag_saving = true;
      await this.fetch()
    } catch (e) {
      console.error(e);
    }
    this.dag_saving = false;
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
    const cp1 = D.collision_point({ from: c2, to: c1 }, node_from);
    const cp2 = D.collision_point({ from: c1, to: c2 }, node_to);
    if (!cp1 || !cp2) { return {} }
    const rp = Math.pow(cp2.x - cp1.x, 2) + Math.pow(cp2.y - cp1.y, 2);
    if (!rp) { return {} }
    const neighboring = !!(this.reachable_map && (this.reachable_map.from_neighboring_link[anchor.id] || this.reachable_map.to_neighboring_link[anchor.id]));
    const connected = !!(this.reachable_map && (this.reachable_map.from_connected_link[anchor.id] || this.reachable_map.to_connected_link[anchor.id]));
    // console.log(anchor.id, neighboring, connected)
    const stroke_attr = this.selected_node ? {
      stroke: (neighboring ? "#111" : connected ? "#444" : "#eee"),
      "stroke-dasharray": !neighboring && connected ? "3 2" : "",
    } : {
      stroke: "#666",
    };
    return {
      name: anchor.id,
      x1: cp1.x,
      y1: cp1.y,
      x2: cp2.x,
      y2: cp2.y,
      arrowheadPosition: 0.8,
      ...stroke_attr,
    };
  }

  selected_node_id: string = ""
  get selected_node() { return this.node_map[this.selected_node_id] }
  @Watch("selected_node_id")
  changed_selected_node_id() {
    this.flush_node_status_map()
    this.update_all_links()
    if (this.selected_node_id) {
      const nodes = this.nodes.filter(n => n.id !== this.selected_node_id)
      this.x_sorted_nodes = _.sortBy(nodes.map(n => ({ t: n.x + n.width / 2, node: n })), n => n.t);
      this.y_sorted_nodes = _.sortBy(nodes.map(n => ({ t: n.y + n.height / 2, node: n })), n => n.t);
      console.log(this.x_sorted_nodes.map(n => n.node.title))
      console.log(this.y_sorted_nodes.map(n => n.node.title))
    }
  }
  
  x_sorted_nodes: { t: number, node: D.GrabNode }[] = [];
  y_sorted_nodes: { t: number, node: D.GrabNode }[] = [];
  dragging_node_id: string = ""

  /**
   * ノードのドラッグ時にスナップするかどうか
   */
  snap_on = false
  snap_to(tx: number, ty: number, node: D.GrabNode) { 
    /**
     * 昇順ソートされた点列 ps と座標 t が与えられているとき、座標 t にスナップするべき ps の要素 p を見つけたい。
     * p が満たしているべき条件は、スナップの"猶予"をdとすると
     * - t - d <= p
     * - p <= t + d
     */
    const x = tx + node.width / 2;
    const y = ty + node.height / 2;
    const snap_width = 20;
    const x0 = _.findIndex(this.x_sorted_nodes, n => x - snap_width <= n.t);
    const x1 = _.findLastIndex(this.x_sorted_nodes, n => n.t <= x + snap_width);
    const y0 = _.findIndex(this.y_sorted_nodes, n => y - snap_width <= n.t);
    const y1 = _.findLastIndex(this.y_sorted_nodes, n => n.t <= y + snap_width);
    const x_snapped = (x0 >= 0 && x1 >= 0 && x0 <= x1) ? this.x_sorted_nodes[Math.floor((x0 + x1 + 1) / 2)] : null;
    const y_snapped = (y0 >= 0 && y1 >= 0 && y0 <= y1) ? this.y_sorted_nodes[Math.floor((y0 + y1 + 1) / 2)] : null;
    const snap = {
      x: x_snapped ? x_snapped.t - node.width / 2 : tx,
      y: y_snapped ? y_snapped.t - node.height / 2 : ty,
    };
    // if (x_snapped || y_snapped) {
    //   console.log(x_snapped, y_snapped, x, y, snap.x, snap.y, x0, x1, y0, y1);
    // }
    return snap;
  }

  selection_mode: D.SelectionMode | null = null
  @Watch("selection_mode")
  changed_selection_mode() {
    this.flush_node_status_map()
    this.update_all_links()
  }

  resizing_mode: D.ResizeMode | null = null
  over_node: D.GrabNode | null = null
  /**
   * マウスカーソルの現在位置
   */
  cursor_offset: { x: number, y: number } | null = null;
  @Watch("cursor_offset")
  changed_cursor_offset() {
    if (this.cursor_offset) {
      this.indicator_message = JSON.stringify(this.cursor_offset);
    }
  }
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
  /**
   * フィールドのズームレベル
   */
  field_zoom_level = 0;
  get field_transform() {
    const scale = Math.pow(2, this.field_zoom_level);
    return `translate(${this.field_offset.x},${this.field_offset.y}) scale(${scale}, ${scale})`;
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
        const lx = x - this.inner_offset.x;
        const ly = y - this.inner_offset.y;
        if (this.snap_on) {
          const snap = this.snap_to(
            lx,
            ly,
            node
          );  
          node.x = snap.x;
          node.y = snap.y; 
        } else {
          node.x = lx;
          node.y = ly; 
        }
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
  d_mm = _.throttle(this.mm, 33);
  // d_mm = _.throttle(_.debounce(this.mm, 34), 34);


  mdowning_field = false

  /**
   * フィールド上 mousedown
   */
  mdown_field(event: MouseEvent) {
    if (this.selected_node_id) {
      this.selected_node_id = ""
      this.selection_mode = null
      this.resizing_mode = null
    }
    this.mdowning_field = true
    this.cursor_offset = { x: event.clientX, y: event.clientY };
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
      this.inner_offset = { x: Math.floor(event.clientX - node.x), y: Math.floor(event.clientY - node.y) }; 
      this.selection_mode = "move"
      this.selected_node_id = node.id
      this.resizing_mode = null
    }
    this.cursor_offset = { x: event.clientX, y: event.clientY };
  }

  mdown_node_resizer(arg: { event: MouseEvent, node: D.GrabNode, resizeMode: D.ResizeMode }) {
    // console.log(arg.event.type, this.selection_mode)
    const { event, node, resizeMode } = arg;
    this.dragging_node_id = node.id
    this.inner_offset = { x: Math.floor(event.clientX - node.x), y: Math.floor(event.clientY - node.y) }; 
    this.selection_mode = "resize"
    this.selected_node_id = node.id
    this.resizing_mode = resizeMode
    this.set_node_status(node)
    this.cursor_offset = { x: event.clientX, y: event.clientY };
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
    console.log(arg)
  }

  start_linking(node: D.GrabNode) {
    if (this.selection_mode === "link") {
      this.selection_mode = null;
    } else {
      this.selected_node_id = node.id;
      this.selection_mode = "link";
      this.cursor_offset = null;
    }
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

  link_map: D.LinkMap = {};

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

  animating = false
  async align_nodes() {
    try {
      let t = 0;
      const sorted = D.topological_sort(this.nodes, this.link_map, this.reverse_link_map);
      const index_map: { [key: string]: number } = {};
      const layout_map = D.align_by_d3_dag(sorted, this.link_map, this.reverse_link_map);
      _.sortBy(sorted, n => layout_map[n.id].y).forEach((n,i) => index_map[n.id] = i);
      const displacement = _(sorted).map((n,i) => {
        const layout = layout_map[n.id];
        return {
          node: n,
          dx: layout.y - n.x,
          dy: layout.x - n.y,
        }
      }).keyBy(d => d.node.id).value();
      // console.log(displacement);
      const node_map = _.keyBy(this.nodes, n => n.id);
      const target_arg = _.mapValues(node_map, n => 0);
      const th = { ...target_arg };
      const destination_arg = _.mapValues(node_map, n => {
        return {
          value: 100,
          delay: index_map[n.id] / sorted.length * 250,
        };
      });
      const p0 = _.mapValues(node_map, n => _.pick(n, "x", "y"));
      console.log(`[anime] start.`);
      this.animating = true;
      await anime({
        targets: target_arg,
        ...destination_arg,
        duration: 500,
        round: 1,
        easing: 'easeOutExpo',
        update: () => {
          this.nodes.forEach(node => {
            const t = target_arg[node.id];
            node.x = p0[node.id]!.x + displacement[node.id]!.dx * t / 100;
            node.y = p0[node.id]!.y + displacement[node.id]!.dy * t / 100;
          });
          this.flush_node_status_map()
          this.update_all_links()
        }
      }).finished;
      console.log(`[anime] fin.`);
    } catch (e) {
      console.error(e);
    }
    this.animating = false;
  }
}
</script>

<style scoped lang="stylus">
.self
  display flex
  flex-direction row
  height 100%
  background-color #fff
  .mid_pane
    overflow hidden
    flex-grow 1
    flex-shrink 1
    display flex
    flex-direction column
    position relative
    height 100%
  .right_pane
    flex-basis 300px
    flex-grow 0
    flex-shrink 0
  

.panel
  flex-shrink 0
  flex-grow 0
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
    position absolute
    word-break keep-all
    white-space nowrap
    border 1px solid black
    background-color white
    opacity 0.75
    height 30px

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

.panel.status
  display flex
  flex-direction column
  .line
    display flex
    flex-direction row
    width 100%
    .name
      text-align left
      font-weight bold
      flex-shrink 0
      flex-grow 0
    .value
      overflow hidden
      text-align right
      flex-shrink 1
      flex-grow 1
</style>
