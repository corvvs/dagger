import _ from "lodash";
import { firestore } from "firebase";
import * as uuid from "uuid";
import * as Arrow from "@/models/arrow";
import * as U from "@/util";
import * as FB from "@/infra/firestore";
import * as Auth from "@/models/auth";
import * as G from "@/models/geo";
import { SetupContext, onMounted, watch } from '@vue/composition-api';

const version = "0.0.1";

export namespace Network {
  export const typeName = {
    F: "Forest",
    UD: "Undirected",
    D: "Directed",
    DA: "DAG",
  };
  
  export type Type = keyof typeof typeName;

  export type NetData = {
    title: string;
    type: Type;
    nodes: Node[];
    link_map: LinkMap;
    link_appearance: LinkAppearanceMap;
  };
  

  type TypeAttr = {
    loop?: true;
    directed?: true;
    multiple?: true;
    forest?: true;
    cyclic?: true;
  };

  export type Entity = {
    type: "Node" | "Link";
    id: string;
  };

  export type InternalState = {
    action: ActionState;
    resizing_horizontal: "w" | "e" | null;
    resizing_vertical: "n" | "s" | null;
    snap_on: boolean;
    lock_on: boolean;
    selected_entity: Entity | null;
    over_entity: Entity | null;
    working: "saving" | "loading" | "idling";
    animating: boolean;
  };

  export type OffsetGroup =  {
    /**
     * マウスカーソルの現在位置
     */
    cursor: G.Point | null;
    /**
     * ノードの内部座標系におけるオフセット値
     * = ノードの原点から見たオフセット位置の座標
     * リサイズ・移動に使う
     */
    inner: G.Point | null;
    /**
     * フィールドのオフセット値
     * = SVG座標系の原点から見た「現在のビューポートの原点に対応する位置」の座標
     */
    field: G.Point;

    snap: { x: number | null, y: number | null } | null;
  }

  const typeAttr: Readonly<{ [key in Type]: TypeAttr }> = {
    F: { forest: true, },
    UD: { loop: true, cyclic: true, },
    D: { loop: true, directed: true, cyclic: true, },
    DA: { loop: true, directed: true, },
  };

  export type Network = {
    id: string;
    created_at: number;
    updated_at: number;
    ver: string;
    type: Type 

    title: string;
    nodes: Node[];
    links: LinkMap;
    field_offset: G.Point;

    link_appearance: LinkAppearanceMap;
  }

  export function netAttr(type: Type) {
    return typeAttr[type];
  };

  export function changable_type(link_map: LinkMap) {
    return Object.keys(link_map).length === 0;
  };

  export type Node = {
    id: string;
    title: string;
    width: number;
    height: number;
    x: number;
    y: number;
    z: number;
  };

  export type NodeAppearance = {
    text_align: "left" | "center" | "right";
  };

  const defaultNodeAppearance: NodeAppearance = {
    text_align: "left",
  };

  export function spawnNode(overwrite: Partial<Node> = {}) {
    return {
      id: `node_${U.u_shorten_uuid(uuid.v4()).substring(0, 8)}`,
      title: "new node",
      width: 80,
      height: 40,
      x: 100,
      y: 100,
      z: 1,
      ...overwrite,
    }
  }
  
  export type Link = {
    id: string;
    from_id: string;
    to_id: string;
  };

  export type LinkAppearance = {
    id: string;
    title: string;
    arrow: Arrow.ArrowData;
  }
  
  export type NodeMap = {
    [id: string]: Node;
  };
  
  export type LinkMap = {
    [from: string]: {
      [to: string]: Link
    }
  };

  export type LinkAppearanceMap = {
    [id: string]: LinkAppearance;
  };

  export type NodeStatus = {
    selected: boolean;
    overred: boolean;
    resizing: boolean;
    adjacent_with_selected: boolean;
    reachable_from_selected: boolean;
    reachable_to_selected: boolean;
    linkable_from_selected: boolean;
    not_linkable_from_selected: boolean;
    link_targeted: boolean;
    source_sink: "source" | "sink" | null
  };
  
  export type ActionState = "select_field" | "move_field" | "select_node" | "select_link" | "move_node" | "resize_node" | "link_from";
  export type Head = Pick<Network, "id" | "created_at" | "updated_at" | "title" | "ver">;
  export type HeadLister = FB.ObjectLister<Head>;
  function spawn_lister(user: Auth.User) {
    return new FB.ObjectLister<Head>(user, "net_head");
  }
  export function useObjectLister(props: {
    auth_state: Auth.AuthState;
  }, context: SetupContext) {
    const f = FB.useObjectLister(context, user => spawn_lister(user));
    onMounted(() => {
      if (props.auth_state.user) {
        f.changed_user(props.auth_state)
      }
    });
    watch(() => props.auth_state.user, () => f.changed_user(props.auth_state))
    return {
      ...f,
    }
  }

  export function useObjectEditor() {
    return {
      get,
      spawn,
      post,
    }
  }

  function spawn(id?: string): Network {
    return {
      id: id || `net_${U.u_shorten_uuid(uuid.v4()).substring(0,8)}`,
      title: "",
      type: "UD",
      nodes: [],
      links: {},
      link_appearance: {},
      created_at: 0,
      updated_at: 0,
      ver: version,
      field_offset: { x: 0, y: 0 },
    };
  }
  
  async function get(user: Auth.User, id: string) {
    const r: any = (new FB.ObjectLister(user, "net")).get(id);
    if (!r) { return null; }
    _.each(r.links, (sublinks) => {
      _.each(sublinks, link => {
        link.id = `${link.from_id}_${link.to_id}`;
        if (!link.arrow) {
          link.arrow = {
            type: "direct",
          };
        }
        Object.assign(link.arrow, _.pick(link, "id", "from_id", "to_id"));
        if (!link.arrow.head) { link.arrow.head = {}; }
        if (!link.arrow.shaft) { link.arrow.shaft = {}; }
      });
    });
    return r;
  }

  function post(user: Auth.User, net: Network) {
    const data: any = _.cloneDeep(net);
    _.each(data.links, sublinks => {
      _.each(sublinks, (link, id) => {
        ["head", "shaft", "arrow"].forEach(key => 
          link[key] = _.omit(link[key], "id", "from_id", "to_id")
        );
      });
    });
    return (new FB.ObjectLister(user, "net")).save(data);
  }
  
  type Reachability = {
    /**
     * 到達可能ノード
     */
    reachable_node: { [key: string]: number };
    /**
     * 隣接ノード
     */
    adjacent_node: { [key: string]: number };
    /**
     * 到達可能リンク
     */
    reachable_link: { [key: string]: Link };
    /**
     * 隣接リンク
     */
    adjacent_link: { [key: string]: Link } ;
  }

  /**
   * 一般のグラフに対する到達可能性調査
   */
  export function survey_reachablility(net: Network, origin_node: Node, node_map: NodeMap, link_map: LinkMap, reverse_link_map: LinkMap) {
    const net_attr = typeAttr[net.type];
    const forward: Reachability = { reachable_node: {}, reachable_link: {}, adjacent_node: {},  adjacent_link: {}, };

    function survey(r: Reachability, linkmap: LinkMap) {
      // BFSの開始ノード
      let deps: { [key: string]: Node } = { [origin_node.id]: origin_node };
      const n = Object.keys(node_map).length;
      for (let distance = 1; distance < n * 2; ++distance) {
        if (Object.keys(deps).length === 0) { break; }
        const d2: { [key: string]: Node } = {};
        for (const fid of Object.keys(deps)) {
          // console.log(dir, fid, !!d2[fid])
          // すでに次に訪問する予定になっているノードは除外する
          if (r.reachable_node[fid]) { continue; }
          r.reachable_node[fid] = distance;
          if (d2[fid]) { continue; }
          const submap = linkmap[fid];
          if (!submap) { continue; }
          for (const tid of Object.keys(submap)) {
            if (r.reachable_node[tid]) { continue; }
            if (d2[tid]) { continue; }
            const link = submap[tid];
            const link_id = link.id;
            if (distance === 1) {
              r.adjacent_link[link_id] = link;
              r.adjacent_node[tid] = distance;
            }
            r.reachable_link[link_id] = link;
            if (r.reachable_node[tid]) { continue }
            d2[tid] = node_map[tid];
          };
        };
        // console.log(Object.keys(d2))
        deps = d2;
        // console.log(dir, Object.keys(deps));
      }
    }

    // - 順到達可能(from,to)
    //   - fromからtoへ向かう**路**がある
    // - 逆到達可能(from,to)
    //   - toからfromへ向かう**路**がある
    // - 順隣接(from,to)
    //   - fromからtoへ向かう**辺**がある
    // - 逆隣接(from,to)
    //   - toからfromへ向かう**辺**がある
    if (net_attr.directed) {
      // 向き有りの場合
      const backward: Reachability = { reachable_node: {}, reachable_link: {}, adjacent_node: {},  adjacent_link: {}, };
      survey(forward, link_map);
      survey(backward, reverse_link_map);
      return { forward, backward };
    } else {
      // 向き無しの場合
      const undirected_link_map: LinkMap = {};
      _.each([link_map, reverse_link_map], (lm) => {
        _.each(lm, (submap, from) => {
          undirected_link_map[from] = undirected_link_map[from] || {};
          _.each(submap, (v, to) => {
            undirected_link_map[from][to] = v;
          });
        })
      });
      // console.log(undirected_link_map);
      survey(forward, undirected_link_map);
      return {
        forward, backward: forward,
      };
    }
  }

  export function is_linkable_from_selected(netType: Type, rm: { forward: Reachability; backward: Reachability }, from: Node, to: Node) {
    // - リンク可能(from,to)
    //   - 自己辺を許していない時: from == to ならばNo
    const netAttr = typeAttr[netType];
    if (!netAttr.loop && from.id === to.id) { return false }
    //   - 多重辺を許していない時: 順隣接しているならばNo
    if (!netAttr.multiple && rm.forward.adjacent_node[to.id]) { return false; }
    //   - 多重辺を許していない and 無向の時: 逆隣接しているならばNo
    if (!netAttr.multiple && !netAttr.directed && rm.backward.adjacent_node[to.id]) { return false; }
    //   - 非巡回な時: 逆到達可能ならばNo
    if (!netAttr.cyclic && rm.backward.reachable_node[to.id]) { return false; }
    //   - 木の時: 逆到達可能または順到達可能ならばNo
    if (netAttr.forest && rm.backward.reachable_node[to.id]) { return false; }
    if (netAttr.forest && rm.forward.reachable_node[to.id]) { return false; }
    // - グラフのクラスによる分類
    //   - 無向木: 逆到達可能または順到達可能ならばNo
    //   - 無向グラフ: 順隣接または逆隣接しているならばNo
    //   - 有向グラフ: 順隣接しているならばNo
    //   - DAG: 逆到達可能または順隣接しているならばNo
    return  true;
  }

  export function snap_to(
    t: G.Point,
    node: Node,
    x_sorted_nodes: { t: number, node: Node }[],
    y_sorted_nodes: { t: number, node: Node }[]
  ) {
    /**
     * 昇順ソートされた点列 ps と座標 t が与えられているとき、座標 t にスナップするべき ps の要素 p を見つけたい。
     * p が満たしているべき条件は、スナップの"猶予"をdとすると
     * - t - d <= p
     * - p <= t + d
     */
    const x = t.x + node.width / 2;
    const y = t.y + node.height / 2;
    const snap_width = 20;
    const x0 = _.findIndex(x_sorted_nodes, n => x - snap_width <= n.t);
    const x1 = _.findLastIndex(x_sorted_nodes, n => n.t <= x + snap_width);
    const y0 = _.findIndex(y_sorted_nodes, n => y - snap_width <= n.t);
    const y1 = _.findLastIndex(y_sorted_nodes, n => n.t <= y + snap_width);
    const x_snapped = (x0 >= 0 && x1 >= 0 && x0 <= x1) ? x_sorted_nodes[Math.floor((x0 + x1 + 1) / 2)] : undefined;
    const y_snapped = (y0 >= 0 && y1 >= 0 && y0 <= y1) ? y_sorted_nodes[Math.floor((y0 + y1 + 1) / 2)] : undefined;
    const snap = {
      x: x_snapped ? x_snapped.t : null,
      y: y_snapped ? y_snapped.t : null,
    };
    // if (x_snapped || y_snapped) {
    //   console.log(x_snapped, y_snapped, x, y, snap.x, snap.y, x0, x1, y0, y1);
    // }
    return snap;
  }

  export function link_for(
    selected_node: Node,
    to: Node,
  ) {
    const from = selected_node;
    const id = `${from.id}_${to.id}`;
    const link: Link = {
      id,
      from_id: from.id,
      to_id: to.id,
    };
    const appearance: LinkAppearance = {
      id,
      title: "",
      arrow: {
        ...link,
        type: "direct",
        head: {},
        shaft: {},
      },
    }
    return {
      link,
      appearance,
    };
  }

  export function import_from_text(type: Type, text: string) {
    const lines = _(text.split("\n")).map(t => t.replace(/^\s+/, "").replace(/\s+$/, "")).compact().value();
    if (lines.length < 2) { return null; }
    try {
      const quantities = lines.shift()!.split(/\s+/);
      const [N, M] = quantities.map(t => parseInt(t));
      if (M !== lines.length) {
        throw "Mとリンク数が合致しない";
      }
      const node_names: { [name: string]: Node } = {};
      const link_map: LinkMap = {};
      const reverse_link_map: LinkMap = {};
      const link_appearance: LinkAppearanceMap = {};
      lines.forEach(t => {
        const [a, b] = t.split(/\s+/);
        node_names[a] = node_names[a] || spawnNode({ title: a });
        node_names[b] = node_names[b] || spawnNode({ title: b });
        const from = node_names[a]; const to = node_names[b];
        const result = link_for(from, to);
        link_map[from.id] = link_map[from.id] || {};
        link_map[from.id][to.id] = result.link;
        reverse_link_map[to.id] = reverse_link_map[to.id] || {};
        reverse_link_map[to.id][from.id] = result.link;
        link_appearance[result.link.id] = result.appearance;
      });
      const nodes = _.values(node_names);
      const undirected_link_map: LinkMap = {};
      [link_map, reverse_link_map].forEach(lm => {
        _.each(lm, (submap, fid) => {
          undirected_link_map[fid] = undirected_link_map[fid] || {};
          _.each(submap, (v, tid) => undirected_link_map[fid][tid] = v);
        });
      });

      const attr = netAttr(type);
      // console.log(attr, !attr.loop, !attr.cyclic, !!attr.forest);
      if (!attr.loop && has_loop(link_map)) { throw "detected a loop"; }
      if (!attr.cyclic && has_cycle(link_map)) { throw "detected a cycle"; }
      if (!!attr.forest && has_multiple_path(attr.directed ? link_map : undirected_link_map)) { throw "detected mutiple path"; }

      return {
        nodes,
        link_map,
        link_appearance,
      };
    } catch(e) {
      console.warn(e);
      return null;
    }
  }

  /**
   * ループがあるかどうか調べる
   * -> 全てのリンクについて、from,toを入れ替えたリンクを探す
   */
  function has_loop(link_map: LinkMap) {
    return !!Object.keys(link_map).find(fid => !!link_map[fid][fid])
  }

  /**
   * 閉路があるかどうか調べる
   */
  function has_cycle(link_map: LinkMap) {
    const global_visited_node: { [id: string]: number } = {};
    const global_visited_link: { [id: string]: true } = {};
    const n = Object.keys(link_map).length;
    const nodes = Object.keys(link_map);
    const stack: string[] = [];
    for (const root of nodes) {
      if (global_visited_node[root]) { continue; }
      console.log(root, global_visited_node);
      stack.push(root); 
      for (let i = 0; stack.length > 0 && i < 2 * n; ++i) {
        const f = stack.pop()!; 
        if (!link_map[f]) { continue };
        for (const t of Object.keys(link_map[f])) {
          const link = link_map[f][t];
          console.log(t, link)
          if (global_visited_link[link.id]) { continue; }
          if (t === root) { return true }
          if (global_visited_node[t]) { continue; }
          global_visited_node[t] = (global_visited_node[t] || 0) + 1;
          global_visited_link[link.id] = true;
          stack.push(t);
        }
      }
    }
    console.log(global_visited_node);

    return false;
  }

  /**
   * 複数の経路を持つようなノードのペアが存在するかどうかを調べる
   * -> 全てのノードからBFSを行い、複数回訪問されるノードがあるかどうかを調べる
   */
  function has_multiple_path(link_map: LinkMap) {
    const global_visited_node: { [id: string]: true } = {};
    const global_visited_link: { [id: string]: true } = {};
    const n = Object.keys(link_map).length;
    for (const fid of Object.keys(link_map)) {
      if (global_visited_node[fid]) { continue; }
      let deps: { [id: string]: true } = { [fid]: true };
      for (let distance = 1; distance < n * 2; ++distance) {
        if (Object.keys(deps).length === 0) { break; }
        const d2: { [key: string]: true } = {};
        for (const fid of Object.keys(deps)) {
          // console.log(dir, fid, !!d2[fid])
          // すでに次に訪問する予定になっているノードは除外する
          if (global_visited_node[fid]) { continue; }
          global_visited_node[fid] = true;
          if (d2[fid]) { continue; }
          const submap = link_map[fid];
          if (!submap) { continue; }
          for (const tid of Object.keys(submap)) {
            const link = submap[tid];
            if (global_visited_link[link.id]) { continue; }
            if (d2[tid]) { return true; }
            if (global_visited_node[tid]) { return true; }
            const link_id = link.id;
            global_visited_link[link_id] = true;
            d2[tid] = true;
          };
        };
        deps = d2;
      }
    };
    return false;

  }
}
