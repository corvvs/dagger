import _ from "lodash";
import { firestore } from "firebase";
import * as uuid from "uuid";
import * as Arrow from "@/models/arrow";
import * as U from "@/util";
import * as FB from "@/models/fb";
import * as Auth from "@/models/auth";
import * as G from "@/models/geo";

const version = "0.0.1";

export namespace Network {
  export const typeName = {
    F: "Forest",
    UD: "Undirected",
    D: "Directed",
    DA: "DAG",
  };
  
  type Type = keyof typeof typeName;


  type TypeAttr = {
    loop?: true;
    directed?: true;
    multiple?: true;
    forest?: true;
    cyclic?: true;
  };

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
  }

  export type Node = {
    id: string;
    title: string;
    width: number;
    height: number;
    x: number;
    y: number;
    z: number;
  };

  export type Link = {
    id: string;
    from_id: string;
    to_id: string;
    title: string;
  };
  
  export type NodeMap = {
    [id: string]: Node;
  };
  
  export type LinkMap = {
    [from: string]: {
      [to: string]: Link
    }
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
  export function spawn_lister(user: Auth.User) {
    return new FB.ObjectLister<Head>(firestore().collection(`user/${user.uid}/net_head`));
  }

  export function spawn(id?: string): Network {
    return {
      id: id || `net_${U.u_shorten_uuid(uuid.v4()).substring(0,8)}`,
      title: "",
      type: "UD",
      nodes: [],
      links: {},
      created_at: 0,
      updated_at: 0,
      ver: version,
      field_offset: { x: 0, y: 0 },
    };
  }
  
  export function post(user: Auth.User, net: Network) {
    const now = Date.now();
    net.created_at = net.created_at || now;
    net.updated_at = now;
    const data: any = _.cloneDeep(net);
    _.each(data.links, sublinks => {
      _.each(sublinks, (link, id) => {
        ["head", "shaft", "arrow"].forEach(key => link[key] = _.omit(link[key], "id", "from_id", "to_id"));
      });
    });
    return firestore().collection(`user/${user.uid}/net`).doc(net.id).set(data);
  }
  
  export async function get(user: Auth.User, id: string) {
    const doc = await firestore().collection(`user/${user.uid}/net`).doc(id).get();
    if (!doc.exists) { return null; }
    const r: any = doc.data();
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

    function survey(r: Reachability) {
      // BFSの開始ノード
      let deps: { [key: string]: Node } = { [origin_node.id]: origin_node };
      const n = Object.keys(node_map).length;
      for (let distance = 1; distance < n * 2; ++distance) {
        if (Object.keys(deps).length === 0) { break; }
        const d2: { [key: string]: Node } = {};
        for (const fid of Object.keys(deps)) {
          // console.log(dir, fid, !!d2[fid])
          // すでに次に訪問する予定になっているノードは除外する
          if (d2[fid]) { continue; }
          if (r.reachable_node[fid]) { continue; }
          const linkmaps = net.type === "UD" ? [link_map, reverse_link_map] : [link_map];
          for (const lm of linkmaps) {
            const submap = lm[fid];
            if (!submap) { continue; }
            for (const tid of Object.keys(submap)) {
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
        };
        deps = d2;
        _.each(deps, (node, id) => r.reachable_node[id] = distance);
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
      for (const r of [forward, backward]) { survey(r); }
      return {
        forward, backward,
      };
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

      survey(forward);
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
}

