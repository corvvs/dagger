<template lang="pug">
.self(
  v-bind="self_bind"
  v-if="net"
)
  .mid_pane
    .svgs
      svg.svgmaster(
        ref="svgRef"
        @mousemove.stop="debouncedMouseMove"
        @mouseup.stop="mouseUpField"
        @mousedown.stop="mouseDownField"
      )
        g.field(
          :style="{ 'pointer-events': state.lock_on ? 'none' : 'auto' }"
          :transform="field_transform"
        )
          g.snap(v-if="state.action === 'move_node' && offset.snap")
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
            g.anchor_from(v-for="(anchor, id) in secondary_data.link_dictionary" :key="id")
              SvgArrow(
                v-bind="secondary_data.link_binds[id]"
                @arrowMouseDown="mouseDownArrow"
                @arrowMouseEnter="mouseEnterArrow"
                @arrowMouseLeave="mouseLeaveArrow"
              )

          g.nodes
            SvgNode(v-for="node in netdata.nodes" :key="node.id"
              :node="node"
              :status="secondary_data.node_status_map[node.id]"
              @nodeMouseDownBody="mouseDownNode"
              @nodeMouseDownResizer="mouseDownResizer"
              @nodeMouseEnter="mouseEnterNode"
              @nodeMouseLeave="mouseLeaveNode"
            )
            g.linker(v-if="state.action === 'link_from' && selected_node && anchored_point")


      NodeToolBox(
        v-if="selected_node"
        :node="selected_node"
        :state="state"
        :style="{ left: `${selected_node.x - 5 + offset.field.x}px`, top: `${selected_node.y - 5 + offset.field.y}px` }"
        @tbNodeAction="receiveTbNodeAction"
      )

      LinkToolBox(
        v-if="selected_link && secondary_data.link_binds[selected_link.id]"
        :link="selected_link"
        :state="state"
        :style="{ left: `${secondary_data.link_binds[selected_link.id].center.x + offset.field.x}px`, top: `${secondary_data.link_binds[selected_link.id].center.y + offset.field.y}px` }"
        @tbLinkAction="receiveTbLinkAction"
      )

  .right_pane
    h4 I/O
    h5 {{ net.id }}
    .panel
      .subpanel
        v-btn(x-small :disabled="!savable" :loading="state.working === 'saving'" @click="save()")
          v-icon(small) cloud_upload
          | Save
        v-btn(x-small :disabled="!savable" :loading="state.working === 'loading'" @click="load()")
          v-icon(small) cloud_download
          | Load
    .panel
      .subpanel
        h4 Edit
        v-btn(x-small @click="add_new_node()" :disabled="state.lock_on")
          v-icon(small) add
          | New Node
        v-btn(x-small @click="align_nodes()" :disabled="state.lock_on || state.animating")
          | Align
        v-btn(x-small @click="state.snap_on = !state.snap_on" :color="state.snap_on ? 'blue info' : ''" :disabled="state.lock_on")
          | Snap
        v-btn(x-small @click="state.lock_on = !state.lock_on" :color="state.lock_on ? 'blue info' : ''")
          v-icon(small) lock
          | Lock
        v-btn(x-small @click="showImporterRef = true")
          | Import
      //- v-slider(v-model="field_zoom_level" label="Field Zoom" :min="-4" :max="4" step="1" :messages="`${field_zoom_level}`")
    NodeEditor(v-if="selected_node" :node="selected_node")
    LinkEditor(v-else-if="selected_link"
      :link="selected_link" :appearance="netdata.link_appearance[selected_link.id]"
      @update_link="update_link(selected_link.id)"
    )
    NetEditor(v-else :net="netdata" :changable_net_type="changable_net_type")

    InternalState(:state="state" :offset="offset")
  
  TextImport(
    :network_type="netdata.type" :show="showImporterRef"
    @closeImporter="showImporterRef = false"
    @parsedImporter="receiveImporter"
  )
</template>


<script lang="ts">
import _ from "lodash";
import { Vue } from 'vue-property-decorator';
import * as U from "@/util";
import * as N from "@/models/network";
import SvgNode from "@/components/SvgNode.vue";
import SvgArrow from "@/components/SvgArrow.vue";
import TextImport from "@/components/NetworkTextImport.vue";
import InternalState from "@/components/InternalState.vue";
import NetEditor from "@/components/NetEditor.vue";
import NodeEditor from "@/components/NodeEditor.vue";
import LinkEditor from "@/components/LinkEditor.vue";
import NodeToolBox from "@/components/NodeToolBox.vue";
import LinkToolBox from "@/components/LinkToolBox.vue";
import anime from 'animejs'
import * as Auth from "@/models/auth";
import * as G from "@/models/geo";
import { reactive, ref, Ref, SetupContext, defineComponent, onMounted, PropType, watch, computed } from '@vue/composition-api';

type Node = N.Network.Node;
type Link = N.Network.Link;

type NetData = {
  title: string;
  type: N.Network.Type;
  nodes: Node[];
  link_map: N.Network.LinkMap;
  link_appearance: N.Network.LinkAppearanceMap;
};

type Entity =  N.Network.Entity;


function useImporter() {
  const showImporterRef = ref(false);
  return {
    showImporterRef,
  };
}



const nodeMinimum = {
  width: 30,
  height: 30,
};


export default defineComponent({
  components: {
    SvgNode, SvgArrow, TextImport, InternalState, NetEditor, NodeEditor, LinkEditor, NodeToolBox, LinkToolBox,
  },
  props: {
    auth_state: {
      type: Object as PropType<Auth.AuthState>,
      required: true,
    },
    id: {
      type: String,
      required: true,
    },
  },


  setup(props: {
    auth_state: Auth.AuthState;
    id: string;
  }, context: SetupContext) {
    const svgRef = ref(null);
    const editor = N.Network.useObjectEditor();

    const state: N.Network.InternalState = reactive({
      action: "select_field",
      resizing_horizontal: null,
      resizing_vertical: null,
      snap_on: false,
      lock_on: false,
      selected_entity: null,
      over_entity: null,
      working: "idling",
      animating: false,
    });

    const select_entity = (forcely_deselect?: boolean) => {
      if (state.over_entity) {
        state.selected_entity = state.over_entity;
      } else if (state.selected_entity || forcely_deselect) {
        state.selected_entity = null;
      }
    };
    
    const resizing_mode = computed(() => {
      return (state.resizing_vertical || "") + (state.resizing_horizontal || "")
    });

    const net: Ref<N.Network.Network | null> = ref(null);
    const netdata: N.Network.NetData = reactive({
      title: "",
      type: "UD",
      nodes: [],
      link_map: {},
      link_appearance: {},
    });
    const node_map = computed(() => {
      return _.keyBy(netdata.nodes, node => node.id);
    });
    const reverse_link_map = computed(() => {
      const rm: {
        [key: string]: {
          [key: string]: Link
        }
      } = {};
      _.each(netdata.link_map, (submap, from_key) => {
        _.each(submap,  (node, to_key) => {
          rm[to_key] = rm[to_key] || {};
          rm[to_key][from_key] = node;
        });
      });
      return rm;
    });
    const selected_node = computed(() => {
      if (!state.selected_entity) { return null; }
      return node_map.value[state.selected_entity.id] || null;
    });

    const selected_link = computed(() => {
      if (!state.selected_entity) { return null; }
      return secondary_data.link_dictionary[state.selected_entity.id] || null;
    });


    const secondary_data: {
      link_dictionary: { [key: string]: Link };
      link_binds: { [key: string]: any };
      node_status_map: { [key: string]: N.Network.NodeStatus };
      x_sorted_nodes: { t: number, node: Node }[];
      y_sorted_nodes: { t: number, node: Node }[];
      linkable_nodes: { [key: string]: Node };
    } = reactive({
      link_dictionary: {},
      link_binds: {},
      node_status_map: {},
      x_sorted_nodes: [],
      y_sorted_nodes: [],
      linkable_nodes: {},
    });

    const offset: N.Network.OffsetGroup = reactive({
      cursor: null,
      inner: null,
      field: { x: 0, y: 0 },
      snap: null,
    });

    const fetch = async () => {
      console.log(props.auth_state.user);
      state.action = "select_field";
      // select_entity(true)
      state.resizing_horizontal = null
      state.resizing_vertical = null
      offset.inner = null;

      net.value = null;
      netdata.nodes = [];
      netdata.title = "";
      netdata.link_map = {};
      netdata.link_appearance = {};
      secondary_data.link_dictionary = {};
      flush_graph();
      if (props.auth_state.user && props.id) {
        const n = await editor.get(props.auth_state.user, props.id);
        if (n) {
          net.value = n as any;
        } else {
          net.value = editor.spawn(props.id);
        }
        netdata.title = net.value!.title;
        netdata.nodes = net.value!.nodes;
        netdata.link_map = net.value!.links;
        netdata.link_appearance = net.value!.link_appearance || {};
        if (net.value!.field_offset) {
          offset.field = net.value!.field_offset;
        }
        netdata.type = net.value!.type || "UD";
        secondary_data.link_dictionary = {};
        _(netdata.link_map).values().flatMap(submap => _.values(submap)).value().forEach(link => {
          Vue.set(secondary_data.link_dictionary, link.id, link);
        });
        if (!n) {
          add_new_node();
        } else {
          flush_graph();
        }
      }
    };

    const add_new_node = (arg: any = {}) => {
      const n = netdata.nodes.length;
      const node = N.Network.spawnNode({
        ...arg,
        x: (n > 0 ? netdata.nodes[n-1].x : 0) + 10,
        y: (n > 0 ? netdata.nodes[n-1].y : 0) + 10,
      });
      netdata.nodes.push(node);
      flush_graph();
      return node;
    }

    const set_node_status = (node_id: string) => {
      const node = node_map.value[node_id];
      if (!node) { return }
      const snode = selected_node.value;
      const selected_entity = state.selected_entity;
      const selected = !!(selected_entity && selected_entity.id === node.id);
      const linking = state.action === "link_from";
      const overred = !!(state.over_entity && state.over_entity.id === node.id);
      const linkable = !!reachable_map.value && !!snode && N.Network.is_linkable_from_selected(netdata.type, reachable_map.value, snode, node);
      const linkable_from_selected = linking && linkable;
      const is_source = !reverse_link_map.value[node.id];
      const is_sink = !netdata.link_map[node.id];
      const status = {
        selected,
        overred,
        resizing: selected && state.action === "resize_node",
        reachable_from_selected: !!(reachable_map.value && reachable_map.value.forward.reachable_node[node.id]),
        reachable_to_selected: !!(reachable_map.value && reachable_map.value.backward.reachable_node[node.id]),
        adjacent_with_selected: !!(reachable_map.value && reachable_map.value.forward.adjacent_link[node.id]),
        linkable_from_selected,
        not_linkable_from_selected: linking && !linkable,
        link_targeted: !!(!selected && linkable_from_selected && overred),
        source_sink: !!selected_entity ? null : is_source ? "source" : is_sink ? "sink" : null,
      };
      Vue.set(secondary_data.node_status_map, node.id, status)
    }

    /**
     * *node* から/へ到達可能なnodeの辞書を返す
     */
    const reachability = (origin_node: Node) => {
      return N.Network.survey_reachablility(
        net.value!,
        origin_node,
        node_map.value,
        netdata.link_map,
        reverse_link_map.value,
      );
    }

    const set_link_from_selected = (to: Node) => {
      if (!selected_node.value || !reachable_map.value) { return; }
      if (!N.Network.is_linkable_from_selected(netdata.type, reachable_map.value, selected_node.value, to)) { return; }
      const result = N.Network.link_for(selected_node.value, to)
      if (!result) { return; }
      const { link, appearance } = result;
      const from_id = link.from_id;
      const submap = netdata.link_map[from_id]
      if (!netdata.link_map[from_id]) {
        Vue.set(netdata.link_map, from_id , { });
      }
      Vue.set(netdata.link_map[from_id], to.id, link);
      Vue.set(netdata.link_appearance, link.id, appearance);
      Vue.set(secondary_data.link_dictionary, link.id, link);
      Vue.set(secondary_data.link_binds, link.id, link_bind(link));
      flush_graph()
    }

    /**
     * 状態を遷移させる
     */
    const transition_state = (
      event: MouseEvent,
      event_type: "mouseup" | "mousedown" | "mousemove" | "mousedown_on_resizer" | "click_button_link",
      entity: Entity | null,
      recursion = 0
    ) => {
      if (recursion > 1) { return }
      const change_state = (new_state: N.Network.ActionState) => {
        console.log(`[st] ${state.action} -> ${new_state}`)
        state.action = new_state;
        switch (new_state) {
          case "select_field": {
            state.resizing_horizontal = null
            state.resizing_vertical = null
            offset.inner = null;
            break;
          }
          case "move_field": {
            offset.cursor = { x: event.clientX, y: event.clientY };
            break;
          }
          case "select_node": {
            state.resizing_horizontal = null
            state.resizing_vertical = null
            break;
          }
          case "resize_node": {
            offset.cursor = { x: event.clientX, y: event.clientY };
            break;
          }
          case "link_from": {
            offset.cursor = null;
            break;
          }
        }
      }
      switch (state.action) {
        case "select_field": {
          if (event_type === "mousedown" && entity) {
            // - `select_field` -> `select_node`
            //   - ノードをクリック
            if (entity.type === "Node") { 
              change_state("select_node");
              select_entity();
              return;
            }
            // - `select_field` -> `select_link`
            //   - リンク をクリック
            if (entity.type === "Link") {
              change_state("select_link");
              select_entity();
              return;
            }
          }
          if (!entity && event_type === "mousemove") {
            // - `select_field` -> `move_field`
            //   - フィールドの上でマウスダウンしつつマウスを動かす
            if ((event.buttons & 1) === 1) {
              change_state("move_field");
              transition_state(event, event_type, entity, recursion + 1);
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
              transition_state(event, event_type, entity, recursion + 1);
          }
          break;
        }
        case "select_node": {
          if (event_type === "mousedown") {
            if (entity && state.selected_entity && entity.id !== state.selected_entity.id) {
              // - `select_node` -> `select_node`
              //   - (別の)ノードをクリック
              if (entity.type === "Node") {
                change_state("select_node");
                select_entity();
                return;
              }
              // - `select_node` -> `select_link`
              //   - リンクをクリック
              if (entity.type === "Link") {
                change_state("select_link");
                select_entity();
                return;
              }
            }
            if (!entity) {
              // - `select_node` -> `select_field`
              //   - フィールドをクリック
              change_state("select_field");
              select_entity(true);
              transition_state(event, event_type, entity, recursion + 1);
              return;
            }
          }
          // - `select_node` -> `link_from`
          //   - リンクボタンを押す
          if (event_type === "click_button_link" && entity) {
            change_state("link_from");
            return;
          }

          // - `select_node` -> `resize_node`
          //   - リサイザの上でマウスダウンしつつマウスを動かす
          // console.log(!!entity && entity.type === "Node", event_type === "mousedown_on_resizer")
          if (entity && entity.type === "Node" && event_type === "mousedown_on_resizer") {
            change_state("resize_node");
            // transition_state(event, event_type, entity, recursion + 1);
            return;
          }

          if (entity && entity.type === "Node" && event_type === "mousemove") {
            // - `select_node` -> `move_node`
            //   - 選択対象ノードの上でマウスダウンしつつマウスを動かす
            if ((event.buttons & 1) === 1) {
              change_state("move_node");
              transition_state(event, event_type, entity, recursion + 1);
              return;
            }
          }

          break;
        }
        case "select_link": {
          if (event_type === "mousedown") {
            if (entity && state.selected_entity && entity.id !== state.selected_entity.id) {
              // - `select_link` -> `select_node`
              //   - ノードをクリック
              if (entity.type === "Node") {
                change_state("select_node");
                select_entity();
                return;
              }
              // - `select_link` -> `select_link`
              //   - (別の)リンクをクリック
              if (entity.type === "Link") {
                change_state("select_link");
                select_entity();
                return;
              }
            }
            if (!entity) {
              // - `select_node` -> `select_field`
              //   - フィールドをクリック
              change_state("select_field");
              select_entity(true);
              transition_state(event, event_type, entity, recursion + 1);
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
              transition_state(event, event_type, entity, recursion + 1);
          }
          break;
        }
        case "resize_node": {
          // - `resize_node` -> `select_node`
          //   - マウスダウンをやめる
          if (event_type === "mouseup") {
              change_state("select_node");
              transition_state(event, event_type, entity, recursion + 1);
          }
          break;
        }
        case "link_from": {
          // - `link_from` -> `select_node`
          //   - リンクボタンを押す
          if (event_type === "click_button_link" && entity) {
            change_state("select_field");
            return;
          }
          // - `link_from` -> `select_field`
          //   - フィールドをクリック
          if (!entity && event_type == "mousedown") {
            change_state("select_field");
            select_entity(true);
            transition_state(event, event_type, entity, recursion + 1);
            return;
          }
          break;
        }
      }
    }

    const flush_graph = () => {
      secondary_data.node_status_map = {};
      netdata.nodes.forEach(node => set_node_status(node.id));
      _.each(netdata.link_map, (submap, fid) => {
        _.each(submap, (link, tid)  => {
          secondary_data.link_binds[link.id] = link_bind(link);
        });
      });
      console.log("flushed.")
    }

    const reachable_map = computed(() => {
      if (!selected_node.value) { return null }
      return reachability(selected_node.value)
    });

    const link_bind = (anchor: Link) => {
      // console.log(anchor.id, Date.now())
      const node_from = node_map.value[anchor.from_id];
      const node_to = node_map.value[anchor.to_id];
      if (!node_from || !node_to) { return {} }

      const adjacent = !!(reachable_map.value && (reachable_map.value.forward.adjacent_link[anchor.id] || reachable_map.value.backward.adjacent_link[anchor.id]));
      const connected = !!(reachable_map.value && (reachable_map.value.forward.reachable_link[anchor.id] || reachable_map.value.backward.reachable_link[anchor.id]));
      // console.log(anchor.id, adjacent, connected)
      const stroke_attr = selected_node.value ? {
        stroke: "#111",
        stroke_opacity: (adjacent ? "1" : connected ? "0.6" : "0.1"),
        stroke_dasharray: !adjacent && connected ? "3 2" : "",
      } : {
        stroke: "#111",
        stroke_opacity: 0.5,
      };
      const appearance = netdata.link_appearance[anchor.id];

      return {
        status: {
          ..._.pick(anchor, "id", "from_id", "to_id"),
          type: appearance.arrow.type,
          ...stroke_attr,
          head: {
            position: 0.5,
          },
          shaft: {
          },
          name: appearance.title,
          headless: !N.Network.netAttr(netdata.type).directed,
        },
        from: node_from,
        to: node_to,
        arrow_id: anchor.id,
        selected: state.selected_entity && state.selected_entity.id === anchor.id,
        over: state.over_entity && state.over_entity.id === anchor.id,
        center: { x: (node_from.x + node_to.x) / 2, y: (node_from.y + node_to.y) / 2 },
      };
    }

    const update_link = (link_id: string) => {
      const link = secondary_data.link_dictionary[link_id];
      if (!link) { return; }
      secondary_data.link_binds[link_id] = link_bind(link);
    };

    const handlers = {
      /**
       * フィールド上 mousedown
       */
      mouseDownField(event: MouseEvent) {
        transition_state(event, "mousedown", null)
      },

      mouseDownNode(arg: { event: MouseEvent, node: Node }) {
        // console.log(arg.event.type, state.action)
        const { event, node } = arg;
        if (state.action === "link_from" && selected_node.value && reachable_map.value) {
          if (selected_node.value && N.Network.is_linkable_from_selected(netdata.type, reachable_map.value, selected_node.value, node)) {
            set_link_from_selected(node)
          }
        } else {
          transition_state(event, "mousedown", { ...node, type: "Node" });
          if (state.action === "select_node") {
            offset.inner = { x: Math.floor(event.clientX - node.x), y: Math.floor(event.clientY - node.y) }; 
            offset.cursor = { x: event.clientX, y: event.clientY };
            flush_graph()
          }
        }
      },

      mouseDownResizer(arg: { event: MouseEvent, node: Node, resizeVertical?: "n" | "s", resizeHorizontal?: "w" | "e" }) {
        // console.log(arg.event.type, state.action)
        const { event, node, resizeVertical, resizeHorizontal } = arg;
        offset.inner = { x: Math.floor(event.clientX - node.x), y: Math.floor(event.clientY - node.y) }; 
        // console.log(arg, state.action)
        transition_state(event, "mousedown_on_resizer", state.selected_entity)
        if (state.action !== "resize_node") { return }
        state.resizing_vertical = arg.resizeVertical || null;
        state.resizing_horizontal = arg.resizeHorizontal || null;
        set_node_status(node.id)
      },

      mouseUpField(event: MouseEvent) {
        transition_state(event, "mouseup", null);
      },

      mouseEnterNode(arg: { event: MouseEvent, node: Node }) {
        // console.log(arg.event.type, state.action)
        const node = arg.node;
        if (!state.over_entity || state.over_entity.id === node.id) {
          state.over_entity = {
            type: "Node", id: node.id
          };
          set_node_status(node.id)
        }
      },

      mouseLeaveNode(arg: { event: MouseEvent, node: Node }) {
        // console.log(arg.event.type, state.action)
        const node = arg.node;
        if (state.over_entity && state.over_entity.id === node.id) {
          if (state.action !== "move_node" && state.action !== "resize_node") {
            state.over_entity = null;
            set_node_status(node.id)
          }
        }
      },

      mouseDownArrow(arg: { event: MouseEvent, arrow_id?: string }) {
        // console.log(arg)
        if (!arg.arrow_id) { return; }
        transition_state(arg.event, "mousedown", { type: "Link", id: arg.arrow_id });
      },

      mouseEnterArrow(arg: { event: MouseEvent, arrow_id?: string }) {
        if (!state.over_entity || state.over_entity.id !== arg.arrow_id) {
          state.over_entity = {
            type: "Link", id: arg.arrow_id!
          };
        }
      },

      mouseLeaveArrow(arg: { event: MouseEvent, arrow_id?: string }) {
        if (state.over_entity && state.over_entity.id === arg.arrow_id) {
          state.over_entity = null;
        }
      },
    };

    /**
     * MouseMove
     */
    const mm =( event: MouseEvent) => {
      transition_state(event, "mousemove", state.selected_entity);
      const x = event.clientX, y = event.clientY;
      function update_links_about(origin: Node) {
        if (netdata.link_map[origin.id]) {
          _.each(netdata.link_map[origin.id], link => secondary_data.link_binds[link.id] = link_bind(link))
        }
        if (reverse_link_map.value[origin.id]) {
          _.each(reverse_link_map.value[origin.id], link => secondary_data.link_binds[link.id] = link_bind(link));
        }
      }


      switch (state.action) {
        case "move_field": {
          if (offset.cursor) {
            // フィールド
            offset.field.x += x - offset.cursor.x;
            offset.field.y += y - offset.cursor.y;
            offset.cursor = { x, y }
          }
          break
        }
        case "move_node": {
          if (!selected_node.value) { break }
          const node = node_map.value[selected_node.value.id];
          if (!node || !offset.inner) { break }
          const lx = x - offset.inner.x;
          const ly = y - offset.inner.y;
          if (state.snap_on) {
            const snap = N.Network.snap_to({
                x: lx,
                y: ly,
              },
              node,
              secondary_data.x_sorted_nodes,
              secondary_data.y_sorted_nodes
            );
            offset.snap = snap;
            node.x = _.isFinite(snap.x) ? snap.x! - node.width / 2 : lx;
            node.y = _.isFinite(snap.y) ? snap.y! - node.height / 2 : ly;
          } else {
            offset.snap = null;
            node.x = lx;
            node.y = ly; 
          }
          update_links_about(node);
          break;
        }
        case "resize_node": {
          const node = selected_node.value;
          if (!node || !offset.cursor) { break; }
          let touched_x = false;
          let touched_y = false
          if (state.resizing_horizontal) {
            const mx = x - offset.cursor.x;
            const new_width = node.width + (state.resizing_horizontal === "w" ? -mx : +mx);
            if (nodeMinimum.width <= new_width) {
              if (state.resizing_horizontal === "w") {
                node.x += mx;
              }
              node.width = new_width;
              touched_x = true;
              offset.cursor.x = x;
            }
          }
          if (state.resizing_vertical) {
            const my = y - offset.cursor.y;
            const new_height = node.height + (state.resizing_vertical === "n" ? -my : +my);
            if (nodeMinimum.height <= new_height) {
              if (state.resizing_vertical === "n") {
                node.y += my;
              }
              node.height = new_height;
              touched_y = true;
              offset.cursor.y = y;
            }
          }
          if (touched_x || touched_y) {
            update_links_about(node);
          }
          break;
        }
        case "link_from": {
          offset.cursor = { x, y };
          break;
        }
      }
    }

    const changed_entity = (newValue: Entity | null, oldValue: Entity | null) => {
      if (newValue) {
        if (newValue.type === "Node") { set_node_status(newValue.id) }
        if (newValue.type === "Link") { update_link(newValue.id) }
      }
      if (oldValue) {
        if (oldValue.type === "Node") { set_node_status(oldValue.id) }
        if (oldValue.type === "Link") { update_link(oldValue.id) }
      }
    }

    const delete_link = (link: Link, doConfirm = false) => {
      if (doConfirm && !confirm("このリンクを削除します。")) { return }
      Vue.delete(secondary_data.link_dictionary, link.id);
      Vue.delete(secondary_data.link_binds, link.id);
      Vue.delete(netdata.link_map[link.from_id], link.to_id);
      flush_graph();
    };
    const delete_node = (node: Node) => {
      const i = netdata.nodes.findIndex(n => n.id === node.id);
      if (i < 0) { return }
      if (!confirm("このノードと、このノードに出入りするリンクを削除します。")) { return }
      if (netdata.link_map[node.id]) {
        _.each(netdata.link_map[node.id], (link) => delete_link(link));
      }
      if (reverse_link_map.value[node.id]) {
        _.each(reverse_link_map.value[node.id], (link) => delete_link(link));
      }
      Vue.delete(secondary_data.node_status_map, node.id);
      netdata.nodes.splice(i, 1);
      flush_graph();
    };

    watch(() => netdata.type, () => flush_graph());
    watch(() => state.action, () => flush_graph());
    watch(() => props.auth_state.user, () => fetch());
    watch(() => props.id, () => fetch());
    watch(() => state.selected_entity, (newValue, oldValue) => {
      changed_entity(newValue, oldValue);
      flush_graph();
      if (newValue && newValue.type === "Node") {
        const nodes = netdata.nodes.filter(n => n.id !== newValue.id)
        secondary_data.x_sorted_nodes = _.sortBy(nodes.map(n => ({ t: n.x + n.width / 2, node: n })), n => n.t);
        secondary_data.y_sorted_nodes = _.sortBy(nodes.map(n => ({ t: n.y + n.height / 2, node: n })), n => n.t);
      }
    });
    onMounted(() => fetch());

    return {
      svgRef,
      state,
      net,
      netdata,
      secondary_data,
      offset,

      // computed
      self_bind: computed(() => {
        const r = {
          class: _.compact([
            state.action || "select_field",
            resizing_mode.value,
            state.action === "move_field" ? "dragging-field" : "",
          ]),
        };
        return r;
      }),
      field_transform: computed(() => {
        const scale = 1;//Math.pow(2, this.field_zoom_level);
        return `translate(${offset.field.x},${offset.field.y}) scale(${scale}, ${scale})`;
      }),
      anchored_point: computed(() => {
        const svg: any = svgRef.value;
        if (!svg) { return null; }
        const rect = svg.getBoundingClientRect();
        if (state.action === "link_from") {
          const over_node = state.over_entity && state.over_entity.type === "Node" ? node_map.value[state.over_entity.id] : null;
          if (reachable_map.value && selected_node.value && over_node && N.Network.is_linkable_from_selected(netdata.type, reachable_map.value, selected_node.value, over_node)) {
            return {
              x: over_node.x + over_node.width/2,
              y: over_node.y + over_node.height/2,
            };
          }
        }
        return offset.cursor ? {
          x: offset.cursor.x - offset.field.x - rect.x,
          y: offset.cursor.y - offset.field.y - rect.y,
        } : null;
      }),
      selected_node,
      selected_link,
      savable: computed(() => { return !!net.value && !!props.auth_state.user && state.working === "idling"; }),
      // reachable_map,
      changable_net_type: computed(() => N.Network.changable_type(netdata.link_map)),

      // methods
      add_new_node,
      ...handlers,
      debouncedMouseMove: _.throttle(mm, 33),
      receiveImporter: (arg: {
        nodes: Node[];
        link_map: N.Network.LinkMap;
        link_appearance: N.Network.LinkAppearanceMap;
      }) => {
        console.log(arg);
        netdata.nodes = arg.nodes;
        netdata.link_map = arg.link_map;
        netdata.link_appearance = arg.link_appearance;
        const link_dictionary = _(arg.link_map).flatMap(submap => _.values(submap)).keyBy(link => link.id).value();
        secondary_data.link_dictionary = link_dictionary;
        secondary_data.link_binds = _.mapValues(link_dictionary, link => link_bind(link));
        flush_graph();
      },
      update_link,
      delete_link,
      delete_node,

      ...useImporter(),

      // I/O
      async save() {
        if (!props.auth_state.user) { return }
        if (!net.value) { return }
        if (state.working !== "idling") { return }
        try {
          state.working = "saving";
          net.value.type = netdata.type;
          net.value.nodes = netdata.nodes;
          net.value.links = netdata.link_map;
          net.value.link_appearance = netdata.link_appearance;
          net.value.title = netdata.title;
          net.value.field_offset = offset.field;
          await editor.post(props.auth_state.user, net.value);
        } catch (e) {
          console.error(e);
        }
        state.working = "idling";
      },

      async load() {
        if (!props.auth_state.user) { return }
        if (!confirm("前回の保存より後の編集結果を取り消し、サーバに保存されている状態に戻します")) { return }
        if (!net.value) { return }
        if (state.working !== "idling") { return }
        try {
          state.working = "loading";
          await fetch()
        } catch (e) {
          console.error(e);
        }
        state.working = "idling";
      },

      receiveTbNodeAction: (payload: any) => {
        const { event, action, node } = payload;
        switch (action) {
          case "link": {
            transition_state(event, "click_button_link", { id: node.id, type: "Node" })
            break;
          }
          case "add_node": {
            const node = add_new_node();
            set_link_from_selected(node);
            break;
          }
          case "delete": {
            delete_node(node);
            break;
          }
        }
      },

      receiveTbLinkAction: (payload: any) => {
        const { event, action, link } = payload;
        switch (action) {
          case "delete": {
            delete_link(link, true);
            break;
          }
        }
      },
};
  }
});
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

</style>
