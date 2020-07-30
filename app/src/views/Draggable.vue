<template lang="pug">
.self(
  v-bind="self_bind"
  v-if="dag"
)
  .mid_pane
    .svgs
      svg.svgmaster(
        ref="svg"
        @mousemove.stop="debouncedMouseMove"
        @mouseup.stop="mouseUpField"
        @mousedown.stop="mouseDownField"
      )
        g.field(
          :style="{ 'pointer-events': lock_on ? 'none' : 'auto' }"
          :transform="field_transform"
        )
          g.snap(v-if="action_state === 'move_node' && offset.snap")
            g.horizontal
              line(
                v-if="typeof offset.snap.y === 'number'"
                x1="-100000"
                x2="100000"
                :y1="offset.snap.y"
                :y2="offset.snap.y"
                stroke="#aaf"
              )
            g.vertical
              line(
                v-if="typeof offset.snap.x === 'number'"
                :x1="offset.snap.x"
                :x2="offset.snap.x"
                y1="-100000"
                y2="100000"
                stroke="#aaf"
              )

          g.anchors
            g.anchor_from(v-for="(anchor, id) in link_dictionary" :key="id")
              SvgArrow(
                v-bind="link_binds[id]"
                @arrowMouseDown="mouseDownArrow"
                @arrowMouseEnter="mouseEnterArrow"
                @arrowMouseLeave="mouseLeaveArrow"
              )

          g.nodes
            SvgGrabNode(v-for="node in nodes" :key="node.id"
              :node="node"
              :status="node_status_map[node.id]"
              @nodeMouseDownBody="mouseDownNode"
              @nodeMouseDownResizer="mouseDownResizer"
              @nodeMouseEnter="mouseEnterNode"
              @nodeMouseLeave="mouseLeaveNode"
            )
            g.linker(v-if="action_state === 'link_from' && selected_node && anchored_point")


      .node-panel(
        v-if="selected_node"
        :style="{ left: `${selected_node.x - 5 + offset.field.x}px`, top: `${selected_node.y - 5 + offset.field.y}px` }"
      )
        v-btn(small icon tile
          @click="start_linking(selected_node.id)"
          :color="action_state === 'link_from' ? 'info' : 'grey'"
          dark
          title="ここからリンク"
        )
          v-icon(
          dark
          ) link
        v-btn(small icon tile
          @click="flip_node_to('front', selected_node)"
          title="最前面へ"
        )
          v-icon flip_to_front
        v-btn(small icon tile
          @click="flip_node_to('back', selected_node)"
          title="最背面へ"
        )
          v-icon flip_to_back
        v-btn(small icon tile
          color="red"
          @click="delete_node(selected_node)"
          title="削除"
        )
          v-icon delete

      .link-panel(
        v-if="selected_link && link_binds[selected_link.id]"
        :style="{ left: `${link_binds[selected_link.id].center.x + offset.field.x}px`, top: `${link_binds[selected_link.id].center.y + offset.field.y}px` }"
      )
        v-btn(small icon tile
          color="red"
          @click="delete_link(selected_link, true)"
          title="削除"
        )
          v-icon delete


  .right_pane
    h4 I/O
    h5 {{ dag.id }}
    .panel
      .subpanel
        v-btn(x-small :disabled="!dag_savable" :loading="dag_working === 'saving'" @click="dag_save()")
          v-icon(small) cloud_upload
          | Save
        v-btn(x-small :disabled="!dag_savable" :loading="dag_working === 'loading'" @click="dag_load()")
          v-icon(small) cloud_download
          | Load
    h4 Edit
    .panel
      .subpanel
        v-btn(x-small @click="add_new_node()" :disabled="lock_on")
          v-icon(small) add
          | New Node
        v-btn(x-small @click="align_nodes()" :disabled="lock_on || animating")
          | Align
        v-btn(x-small @click="snap_on = !snap_on" :color="snap_on ? 'blue info' : ''" :disabled="lock_on")
          | Snap
        v-btn(x-small @click="lock_on = !lock_on" :color="lock_on ? 'blue info' : ''")
          v-icon(small) lock
          | Lock
      v-slider(v-model="field_zoom_level" label="Field Zoom" :min="-4" :max="4" step="1" :messages="`${field_zoom_level}`")
      .subpanel
        v-text-field(v-model="title" label="Graph Title")

      .subpanel(v-if="selected_node")
        .line
          .name Selected Node
          .value {{ selected_node.id }}
        v-textarea(v-model="selected_node.title" label="Node Title")

      .subpanel(v-if="selected_link")
        .line
          .name Selected Link
          .value {{ selected_link.id }}
        v-text-field(v-model="selected_link.title" label="Link Title")
        h5 Type: {{ selected_link.arrow.type }}
        v-btn-toggle(v-model="selected_link.arrow.type" mandatory dense tile @change="update_link(selected_link.id)")
          v-btn(light small text value="direct")
            v-icon arrow_forward
          v-btn(light small text value="parallel")
            v-icon subdirectory_arrow_right

        
    h4 Internal State
    .panel.status
      .line
        .name Action Mode
        .value {{ action_state }}
      .line
        .name Resize Mode
        .value ({{ resizing_mode_vertical }}, {{ resizing_mode_horizontal }})
      .line
        .name Over Entity
        .value {{ over_entity || "(none)" }}
      .line
        .name Field Offset
        .value {{ offset.field || "(none)" }}
      .line
        .name Cursor Offset
        .value {{ offset.cursor || "(none)" }}
      .line
        .name Inner Offset
        .value {{ offset.inner || "(none)" }}
      .line
        .name Snap To
        .value {{ offset.snap || "(none)" }}
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
import * as Auth from "@/models/auth";

type Entity = {
  type: "Node" | "Link";
  id: string;
};

function makeGrabNode(overwrite: Partial<D.GrabNode> = {}) {
  return {
    id: `nd_${U.u_shorten_uuid(uuid.v4()).substring(0, 8)}`,
    title: "new node",
    width: 80,
    height: 40,
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

  @Prop() auth_state!: Auth.AuthState
  @Prop() dag_id!: string;

  @Watch("auth_state.user")
  @Watch("dag_id")
  async fetch() {
    console.log(this.auth_state.user);
    this.dag = null;
    this.nodes = [];
    this.title = "";
    this.link_map = {};
    this.link_dictionary = {};
    this.flush_graph()
    if (this.auth_state.user && this.dag_id) {
      const dag = await D.get_dag(this.auth_state.user, this.dag_id);
      if (dag) {
        this.dag = dag as any;
      } else {
        this.dag = D.new_dag(this.dag_id);
      }
      this.title = this.dag!.title;
      this.nodes = this.dag!.nodes;
      this.link_map = this.dag!.links;
      if (this.dag!.field_offset) {
        this.offset.field = this.dag!.field_offset;
      }
      this.link_dictionary = {};
      _(this.link_map).values().flatMap(submap => _.values(submap)).value().forEach(link => {
        Vue.set(this.link_dictionary, link.id, link);
      });
      if (!dag) {
        this.add_new_node();
      }
      this.flush_graph();
    }
  }

  mounted() {
    this.fetch()
  }



  dag: D.GrabDAG | null = null
  title: string = "";
  nodes: D.GrabNode[] = [];
  link_map: D.LinkMap = {};
  link_dictionary: { [key: string]: D.GrabLink } = {}

  get node_map() {
    return _.keyBy(this.nodes, node => node.id)
  }

  node_status_map: { [key: string]: D.GrabNodeStatus } = {};
  node_status(node: D.GrabNode): D.GrabNodeStatus {
    const selected_entity = this.selected_entity;
    const selected = !!(selected_entity && selected_entity.id === node.id);
    const linking = this.action_state === "link_from";
    const overred = !!(this.over_entity && this.over_entity.id === node.id);
    const linkable_from_selected = linking && this.linkable_from_selected(node);
    const is_source = !this.reverse_link_map[node.id];
    const is_sink = !this.link_map[node.id];
    return {
      selected,
      overred,
      resizing: selected && this.action_state === "resize_node",
      reachable_from_selected: !!(this.reachable_map && this.reachable_map.from_selected[node.id]),
      reachable_to_selected: !!(this.reachable_map && this.reachable_map.to_selected[node.id]),
      neighboring_with_selected: !!(this.reachable_map && this.reachable_map.to_neighboring_link[node.id]),
      linkable_from_selected,
      not_linkable_from_selected: linking && !this.linkable_from_selected(node),
      link_targeted: !!(!selected && linkable_from_selected && overred),
      source_sink: !!selected_entity ? null : is_source ? "source" : is_sink ? "sink" : null,
    };
  }
  flush_graph() {
    this.node_status_map = {};
    this.nodes.forEach(node => this.set_node_status(node.id));
    _.each(this.link_map, (submap, fid) => {
      _.each(submap, (link, tid)  => {
        this.link_binds[link.id] = this.link_bind(link);
      });
    });
  }
  set_node_status(node_id: string) {
    const node = this.node_map[node_id];
    if (!node) { return }
    Vue.set(this.node_status_map, node.id, this.node_status(node))
  }

  add_new_node(arg: any = {}) {
    const n = this.nodes.length;
    this.nodes.push(makeGrabNode({
      ...arg,
      x: (n > 0 ? this.nodes[n-1].x : 0) + 10,
      y: (n > 0 ? this.nodes[n-1].y : 0) + 10,
    }));
    this.flush_graph()
  }

  /**
   * *node* から/へ到達可能なnodeの辞書を返す
   */
  reachable_nodes(dir: "from" | "to", origin_node: D.GrabNode) {
    return D.survey_reachablility(origin_node, this.node_map, dir === "from" ? this.link_map : this.reverse_link_map);
  }

  get selected_node() {
    if (!this.selected_entity) { return null; }
    return this.node_map[this.selected_entity.id] || null;
  }


  get selected_link() {
    if (!this.selected_entity) { return null; }
    return this.link_dictionary[this.selected_entity.id] || null;
  }

  get selected_link_bind() {
    if (!this.selected_entity) { return null; }
    return this.link_binds[this.selected_entity.id] || null;
  }

  get reachable_map() {
    if (!this.selected_node) { return null }
    const from = this.reachable_nodes("from", this.selected_node)
    const to = this.reachable_nodes("to", this.selected_node)
    return {
      /**
       * selected_node から到達可能なノード
       */
      from_selected: from.reachable_node,
      /**
       * selected_node から出ているリンク
       */
      from_neighboring_link: from.neighboring_link,
      /**
       * selected_node から到達可能なリンク
       */
      from_connected_link: from.connected_link,
      /**
       * selected_node に到達可能なノード
       */
      to_selected: to.reachable_node,
      /**
       * selected_node に入っているリンク
       */
      to_neighboring_link: to.neighboring_link,
      /**
       * selected_node に到達可能なリンク
       */
      to_connected_link: to.connected_link,
    }
  }

  linkable_from_selected(to: D.GrabNode) {
    if (!this.selected_node || this.action_state !== "link_from" || !this.reachable_map) { return false; }
    if (this.selected_node.id === to.id) { return false; }
    if (this.reachable_map.to_selected[to.id]) { return false; }
    if (this.reachable_map.from_selected[to.id] <= 1) { return false; }
    return true;
  }

  get dag_savable() { return !!this.dag && !!this.auth_state.user && this.dag_working === "idling"; }
  dag_working: "saving" | "loading" | "idling" = "idling";

  async dag_save() {
    if (!this.auth_state.user) { return }
    if (!this.dag) { return }
    if (this.dag_working !== "idling") { return }
    try {
      this.dag_working = "saving";
      this.dag.nodes = this.nodes;
      this.dag.links = this.link_map;
      this.dag.title = this.title;
      this.dag.field_offset = this.offset.field;
      await D.post_dag(this.auth_state.user, this.dag);
    } catch (e) {
      console.error(e);
    }
    this.dag_working = "idling";
  }

  async dag_load() {
    if (!this.auth_state.user) { return }
    if (!confirm("前回の保存より後の編集結果を取り消し、サーバに保存されている状態に戻します")) { return }
    if (!this.dag) { return }
    if (this.dag_working !== "idling") { return }
    try {
      this.dag_working = "loading";
      await this.fetch()
    } catch (e) {
      console.error(e);
    }
    this.dag_working = "idling";
  }

  get self_bind() {
    const r = {
      class: _.compact([
        this.action_state || "select_field",
        this.resizing_mode,
        this.action_state === "move_field" ? "dragging-field" : "",
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

    const neighboring = !!(this.reachable_map && (this.reachable_map.from_neighboring_link[anchor.id] || this.reachable_map.to_neighboring_link[anchor.id]));
    const connected = !!(this.reachable_map && (this.reachable_map.from_connected_link[anchor.id] || this.reachable_map.to_connected_link[anchor.id]));
    // console.log(anchor.id, neighboring, connected)
    const stroke_attr = this.selected_node ? {
      stroke: "#111",
      stroke_opacity: (neighboring ? "1" : connected ? "0.6" : "0.1"),
      stroke_dasharray: !neighboring && connected ? "3 2" : "",
    } : {
      stroke: "#111",
      stroke_opacity: 0.5,
    };

    return {
      status: {
        ..._.pick(anchor, "id", "from_id", "to_id"),
        type: anchor.arrow.type,
        ...stroke_attr,
        head: {
          position: 0.5,
        },
        shaft: {
        },
        name: anchor.title,
      },
      from: node_from,
      to: node_to,
      arrow_id: anchor.id,
      selected: this.selected_entity && this.selected_entity.id === anchor.id,
      over: this.over_entity && this.over_entity.id === anchor.id,
      center: { x: (node_from.x + node_to.x) / 2, y: (node_from.y + node_to.y) / 2 },
    };
  }
  
  x_sorted_nodes: { t: number, node: D.GrabNode }[] = [];
  y_sorted_nodes: { t: number, node: D.GrabNode }[] = [];

  /**
   * ノードのドラッグ時にスナップするかどうか
   */
  snap_on = false
  lock_on = false

  action_state: D.ActionState = "select_field"
  @Watch("action_state")
  changed_action_mode() {
    this.flush_graph()
  }

  resizing_mode_vertical: "n" | "s" | null = null
  resizing_mode_horizontal: "w" | "e" | null = null
  get resizing_mode() {
    return (this.resizing_mode_vertical || "") + (this.resizing_mode_horizontal || "")
  }

  offset: {
    /**
     * マウスカーソルの現在位置
     */
    cursor: D.Point | null;
    /**
     * ノードの内部座標系におけるオフセット値
     * = ノードの原点から見たオフセット位置の座標
     * リサイズ・移動に使う
     */
    inner: D.Point | null;
    /**
     * フィールドのオフセット値
     * = SVG座標系の原点から見た「現在のビューポートの原点に対応する位置」の座標
     */
    field: D.Point;

    snap: { x: number | null, y: number | null } | null;
  } = {
    cursor: null,
    inner: null,
    field: { x: 0, y: 0 },
    snap: null,
  };
  /**
   * フィールドのズームレベル
   */
  field_zoom_level = 0;
  get field_transform() {
    const scale = Math.pow(2, this.field_zoom_level);
    return `translate(${this.offset.field.x},${this.offset.field.y}) scale(${scale}, ${scale})`;
  }
  get anchored_point() {
    const svg: any = this.$refs.svg;
    const rect = svg.getBoundingClientRect();
    if (this.action_state === "link_from") {
      const over_node = this.over_entity && this.over_entity.type === "Node" ? this.node_map[this.over_entity.id] : null;
      if (this.selected_node && over_node && D.linkable(this.selected_node, over_node, this.link_map)) {
        return {
          x: over_node.x + over_node.width/2,
          y: over_node.y + over_node.height/2,
        };
      }
    }
    return this.offset.cursor ? {
      x: this.offset.cursor.x - this.offset.field.x - rect.x,
      y: this.offset.cursor.y - this.offset.field.y - rect.y,
    } : null;
  }

  /**
   * MouseMove
   */
  mm(event: MouseEvent) {
    this.transition_state(event, "mousemove", this.selected_entity);
    const x = event.clientX, y = event.clientY;

    switch (this.action_state) {
      case "move_field": {
        if (this.offset.cursor) {
          // フィールド
          this.offset.field.x += x - this.offset.cursor.x;
          this.offset.field.y += y - this.offset.cursor.y;
          this.offset.cursor = { x, y }
        }
        break
      }
      case "move_node": {
        if (!this.selected_node) { break }
        const node = this.node_map[this.selected_node.id];
        if (!node || !this.offset.inner) { break }
        const lx = x - this.offset.inner.x;
        const ly = y - this.offset.inner.y;
        if (this.snap_on) {
          const snap = D.snap_to({
              x: lx,
              y: ly,
            },
            node,
            this.x_sorted_nodes,
            this.y_sorted_nodes
          );
          this.offset.snap = snap;
          node.x = _.isFinite(snap.x) ? snap.x! - node.width / 2 : lx;
          node.y = _.isFinite(snap.y) ? snap.y! - node.height / 2 : ly;
        } else {
          this.offset.snap = null;
          node.x = lx;
          node.y = ly; 
        }
        this.flip_node_to("front", node);
        this.update_links_about(node);
        break;
      }
      case "resize_node": {
        const node = this.selected_node;
        if (!node || !this.offset.cursor) { break; }
        let touched_x = false;
        let touched_y = false
        if (this.resizing_mode_horizontal) {
          const mx = x - this.offset.cursor.x;
          const new_width = node.width + (this.resizing_mode_horizontal === "w" ? -mx : +mx);
          if (nodeMinimum.width <= new_width) {
            if (this.resizing_mode_horizontal === "w") {
              node.x += mx;
            }
            node.width = new_width;
            touched_x = true;
            this.offset.cursor.x = x;
          }
        }
        if (this.resizing_mode_vertical) {
          const my = y - this.offset.cursor.y;
          const new_height = node.height + (this.resizing_mode_vertical === "n" ? -my : +my);
          if (nodeMinimum.height <= new_height) {
            if (this.resizing_mode_vertical === "n") {
              node.y += my;
            }
            node.height = new_height;
            touched_y = true;
            this.offset.cursor.y = y;
          }
        }
        if (touched_x || touched_y) {
          this.update_links_about(node);
        }
        break;
      }
      case "link_from": {
        this.offset.cursor = { x, y };
        break;
      }
    }
  }
  debouncedMouseMove = _.throttle(this.mm, 33);


  /**
   * フィールド上 mousedown
   */
  mouseDownField(event: MouseEvent) {
    this.transition_state(event, "mousedown", null)
  }

  mouseDownNode(arg: { event: MouseEvent, node: D.GrabNode }) {
    // console.log(arg.event.type, this.action_state)
    const { event, node } = arg;
    if (this.action_state === "link_from") {
      if (this.selected_node && D.linkable(this.selected_node, node, this.link_map)) {
        this.set_link(this.selected_node, node)
      }
    } else {
      this.transition_state(event, "mousedown", { ...node, type: "Node" });
      if (this.action_state === "select_node") {
        this.offset.inner = { x: Math.floor(event.clientX - node.x), y: Math.floor(event.clientY - node.y) }; 
        this.offset.cursor = { x: event.clientX, y: event.clientY };
        this.changed_action_mode()
      }
    }
  }

  mouseDownResizer(arg: { event: MouseEvent, node: D.GrabNode, resizeVertical?: "n" | "s", resizeHorizontal?: "w" | "e" }) {
    // console.log(arg.event.type, this.action_state)
    const { event, node, resizeVertical, resizeHorizontal } = arg;
    this.offset.inner = { x: Math.floor(event.clientX - node.x), y: Math.floor(event.clientY - node.y) }; 
    // console.log(arg, this.action_state)
    this.transition_state(event, "mousedown_on_resizer", this.selected_entity)
    if (this.action_state !== "resize_node") { return }
    this.resizing_mode_vertical = arg.resizeVertical || null;
    this.resizing_mode_horizontal = arg.resizeHorizontal || null;
    this.set_node_status(node.id)
  }

  mouseUpField(event: MouseEvent) {
    this.transition_state(event, "mouseup", null);
  }

  mouseEnterNode(arg: { event: MouseEvent, node: D.GrabNode }) {
    // console.log(arg.event.type, this.action_state)
    // if (this.action_state !== "select_field") { return; }
    const node = arg.node;
    if (!this.over_entity || this.over_entity.id === node.id) {
      this.over_entity = {
        type: "Node", id: node.id
      };
      this.set_node_status(node.id)
    }
  }

  mouseLeaveNode(arg: { event: MouseEvent, node: D.GrabNode }) {
    // console.log(arg.event.type, this.action_state)
    const node = arg.node;
    if (this.over_entity && this.over_entity.id === node.id) {
      if (this.action_state !== "move_node" && this.action_state !== "resize_node") {
        this.over_entity = null;
        this.set_node_status(node.id)
      }
    }
  }

  mouseDownArrow(arg: { event: MouseEvent, arrow_id?: string }) {
    // console.log(arg)
    if (!arg.arrow_id) { return; }
    this.transition_state(arg.event, "mousedown", { type: "Link", id: arg.arrow_id });
  }

  mouseEnterArrow(arg: { event: MouseEvent, arrow_id?: string }) {
    if (!this.over_entity || this.over_entity.id !== arg.arrow_id) {
      this.over_entity = {
        type: "Link", id: arg.arrow_id!
      };
    }
  }

  mouseLeaveArrow(arg: { event: MouseEvent, arrow_id?: string }) {
    if (this.over_entity && this.over_entity.id === arg.arrow_id) {
      this.over_entity = null;
    }
  }

  /**
   * その時の over_entity を選択する。存在しなければ選択解除を試みる。
   */
  select_entity(forcely_deselect?: boolean) {
    if (this.over_entity) {
      this.selected_entity = this.over_entity;
    } else if (this.selected_entity || forcely_deselect) {
      this.selected_entity = null
    }
  }

  selected_entity: Entity | null = null
  @Watch("selected_entity")
  changed_selected_entity(newValue: typeof Draggable.prototype["over_entity"], oldValue: typeof Draggable.prototype["over_entity"]) {
    this.changed_entity(newValue, oldValue);
    this.flush_graph();
    if (newValue && newValue.type === "Node") {
      const nodes = this.nodes.filter(n => n.id !== newValue.id)
      this.x_sorted_nodes = _.sortBy(nodes.map(n => ({ t: n.x + n.width / 2, node: n })), n => n.t);
      this.y_sorted_nodes = _.sortBy(nodes.map(n => ({ t: n.y + n.height / 2, node: n })), n => n.t);
    }
  }

  over_entity: Entity | null = null
  @Watch("over_entity")
  changed_entity(newValue: typeof Draggable.prototype["over_entity"], oldValue: typeof Draggable.prototype["over_entity"]) {
    if (newValue) {
      if (newValue.type === "Node") { this.set_node_status(newValue.id) }
      if (newValue.type === "Link") { this.update_link(newValue.id) }
    }
    if (oldValue) {
      if (oldValue.type === "Node") { this.set_node_status(oldValue.id) }
      if (oldValue.type === "Link") { this.update_link(oldValue.id) }
    }
  }

  receive_grab(arg: any) {
    console.log(arg)
  }

  start_linking(node_id: string) {
    if (this.action_state === "link_from") {
      this.action_state = "select_field";
    } else {
      // this.select_entity()
      this.action_state = "link_from";
      this.offset.cursor = null;
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
    if (D.linkable(from, to, this.link_map)) {
      const submap = this.link_map[from.id]
      if (!submap || !submap[to.id]) {
        if (!submap) {
          Vue.set(this.link_map, from.id , { });
        }
        const id = `${from.id}_${to.id}`;
        const link: D.GrabLink = {
          id,
          from_id: from.id,
          to_id: to.id,
          title: "",
          arrow: {
            type: "direct",
            id,
            from_id: from.id,
            to_id: to.id,
            head: {},
            shaft: {},
          },
        };
        Vue.set(this.link_map[from.id], to.id, link);
        Vue.set(this.link_dictionary, id, link);
        Vue.set(this.link_binds, id, this.link_bind(link));
      }
    }
    this.flush_graph()
  }

  /**
   * ノード　origin に出入りするリンクを更新する
   */
  update_links_about(origin: D.GrabNode) {
    if (this.link_map[origin.id]) {
      _.each(this.link_map[origin.id], link => this.link_binds[link.id] = this.link_bind(link))
    }
    if (this.reverse_link_map[origin.id]) {
      _.each(this.reverse_link_map[origin.id], link => this.link_binds[link.id] = this.link_bind(link));
    }
  }

  update_link(link_id: string) {
    const link = this.link_dictionary[link_id];
    if (!link) { return; }
    this.link_binds[link_id] = this.link_bind(link);
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

  delete_link(link: D.GrabLink, doConfirm = false) {
    if (doConfirm && !confirm("このリンクを削除します。")) { return }
    Vue.delete(this.link_dictionary, link.id);
    Vue.delete(this.link_binds, link.id);
    Vue.delete(this.link_map[link.from_id], link.to_id);
    this.flush_graph();
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
    Vue.delete(this.node_status_map, node.id);
    this.nodes.splice(i, 1);
    this.flush_graph();
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
          this.flush_graph()
        }
      }).finished;
      console.log(`[anime] fin.`);
    } catch (e) {
      console.error(e);
    }
    this.animating = false;
  }

  /**
   * 状態を遷移させる
   */
  transition_state(
    event: MouseEvent,
    event_type: "mouseup" | "mousedown" | "mousemove" | "mousedown_on_resizer" | "click_button_link",
    entity: Entity | null,
    recursion = 0
    ) {
    if (recursion > 1) { return }
    const change_state = (new_state: D.ActionState) => {
      console.log(`[st] ${this.action_state} -> ${new_state}`)
      this.action_state = new_state;
      switch (new_state) {
        case "select_field": {
          this.resizing_mode_horizontal = null
          this.resizing_mode_vertical = null
          this.offset.inner = null;
          break;
        }
        case "move_field": {
          this.offset.cursor = { x: event.clientX, y: event.clientY };
          break;
        }
        case "select_node": {
          this.resizing_mode_horizontal = null
          this.resizing_mode_vertical = null
          break;
        }
        case "resize_node": {
          this.offset.cursor = { x: event.clientX, y: event.clientY };
          break;
        }
      }
    }
    switch (this.action_state) {
      case "select_field": {
        if (event_type === "mousedown" && entity) {
          // - `select_field` -> `select_node`
          //   - ノードをクリック
          if (entity.type === "Node") { 
            change_state("select_node");
            this.select_entity();
            return;
          }
          // - `select_field` -> `select_link`
          //   - リンク をクリック
          if (entity.type === "Link") {
            change_state("select_link");
            this.select_entity();
            return;
          }
        }
        if (!entity && event_type === "mousemove") {
          // - `select_field` -> `move_field`
          //   - フィールドの上でマウスダウンしつつマウスを動かす
          if ((event.buttons & 1) === 1) {
            change_state("move_field");
            this.transition_state(event, event_type, entity, recursion + 1);
            return;
          }
        }
        break;
      }
      case "move_field": {
        // - `move_field` -> `select_field`
        //   - マウスダウンをやめる
        if (event_type === "mouseup") {
            change_state("select_field");
            this.transition_state(event, event_type, entity, recursion + 1);
        }
        break;
      }
      case "select_node": {
        if (event_type === "mousedown") {
          if (entity && this.selected_entity && entity.id !== this.selected_entity.id) {
            // - `select_node` -> `select_node`
            //   - (別の)ノードをクリック
            if (entity.type === "Node") {
              change_state("select_node");
              this.select_entity();
              return;
            }
            // - `select_node` -> `select_link`
            //   - リンクをクリック
            if (entity.type === "Link") {
              change_state("select_link");
              this.select_entity();
              return;
            }
          }
          if (!entity) {
            // - `select_node` -> `select_field`
            //   - フィールドをクリック
            change_state("select_field");
            this.select_entity(true);
            this.transition_state(event, event_type, entity, recursion + 1);
            return;
          }
        }
        // - `select_node` -> `link_from`
        //   - リンクボタンを押す
        if (event_type === "click_button_link" && entity) {
          this.start_linking(entity.id);
          return;
        }

        // - `select_node` -> `resize_node`
        //   - リサイザの上でマウスダウンしつつマウスを動かす
        // console.log(!!entity && entity.type === "Node", event_type === "mousedown_on_resizer")
        if (entity && entity.type === "Node" && event_type === "mousedown_on_resizer") {
          change_state("resize_node");
          // this.transition_state(event, event_type, entity, recursion + 1);
          return;
        }

        if (entity && entity.type === "Node" && event_type === "mousemove") {
          // - `select_node` -> `move_node`
          //   - 選択対象ノードの上でマウスダウンしつつマウスを動かす
          if ((event.buttons & 1) === 1) {
            change_state("move_node");
            this.transition_state(event, event_type, entity, recursion + 1);
            return;
          }
        }

        break;
      }
      case "select_link": {
        if (event_type === "mousedown") {
          if (entity && this.selected_entity && entity.id !== this.selected_entity.id) {
            // - `select_link` -> `select_node`
            //   - ノードをクリック
            if (entity.type === "Node") {
              change_state("select_node");
              this.select_entity();
              return;
            }
            // - `select_link` -> `select_link`
            //   - (別の)リンクをクリック
            if (entity.type === "Link") {
              change_state("select_link");
              this.select_entity();
              return;
            }
          }
          if (!entity) {
            // - `select_node` -> `select_field`
            //   - フィールドをクリック
            change_state("select_field");
            this.select_entity(true);
            this.transition_state(event, event_type, entity, recursion + 1);
            return;
          }
        }
        break;
      }
      case "move_node": {
        // - `move_node` -> `select_node`
        //   - マウスダウンをやめる
        if (event_type === "mouseup") {
            change_state("select_node");
            this.transition_state(event, event_type, entity, recursion + 1);
        }
        break;
      }
      case "resize_node": {
        // - `resize_node` -> `select_node`
        //   - マウスダウンをやめる
        if (event_type === "mouseup") {
            change_state("select_node");
            this.transition_state(event, event_type, entity, recursion + 1);
        }
        break;
      }
      case "link_from": {
        // - `link_from` -> `select_node`
        //   - リンクボタンを押す
        if (event_type === "click_button_link" && entity) {
          this.start_linking(entity.id);
          return;
        }
        // - `link_from` -> `select_field`
        //   - フィールドをクリック
        if (!entity && event_type == "mousedown") {
          change_state("select_field");
          return;
        }
        break;
      }
    }
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
    border-left 1px solid #bbb
    flex-basis 300px
    flex-grow 0
    flex-shrink 0
    padding 4px
  

.panel
  flex-shrink 0
  flex-grow 0
  padding 4px
  border 1px solid #aaa
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
    border none
    height 100%
    width 100%
    font-size 10px
  .node-panel, .link-panel
    position absolute
    word-break keep-all
    white-space nowrap
    opacity 0.75
    transform-origin: top center;
    transform scale(+1,-1)
    .v-btn
      transform scale(+1,-1)
      border solid 1px #888
      margin 1px

.self
  &.move_field, &.move_node
    cursor grab
    user-select none
    .node-panel
      pointer-events none
  &.resize_node
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
    .node-panel
      pointer-events none

  &.link_from 
    .node.overred
      &:not(.selected)
        &:not(.nonlinkable) .nodebody
          fill #fee
          cursor pointer
        &.nonlinkable .nodebody
          cursor not-allowed

.self:not(&.select_field):not(&.select_node):not(&.select_link) .anchors
  pointer-events none
.linker
  pointer-events none

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
