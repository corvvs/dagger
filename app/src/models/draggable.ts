import _ from "lodash";
import { firestore } from "firebase";
import * as uuid from "uuid";
import * as U from "@/util";
import * as FB from "@/models/fb";
import * as Auth from "@/models/auth";

const dag_version = "0.0.1";

export type Point = {
  x: number;
  y: number;
}

type Vector = {
  /**
   * 始点
   */
  from: Point;
  /**
   * 終点
   */
  to: Point;
};

export type GrabNode = {
  id: string;
  title: string;
  width: number;
  height: number;
  x: number;
  y: number;
  z: number;
};

export type GrabNodeStatus = {
  selected: boolean;
  overred: boolean;
  resizing: boolean;
  neighboring_with_selected: boolean;
  reachable_from_selected: boolean;
  reachable_to_selected: boolean;
  linkable_from_selected: boolean;
  not_linkable_from_selected: boolean;
  link_targeted: boolean;
  source_sink: "source" | "sink" | null
};

export type GrabLink = {
  id: string;
  from_id: string;
  to_id: string;

  title: string,
};

export type GrabArrow = {
  vector: Vector;
  length?: number;
  angle?: number;
};

export type NodeMap = {
  [id: string]: GrabNode;
};

export type LinkMap = {
  [from: string]: {
    [to: string]: GrabLink
  }
};


export type GrabDAG = {
  id: string;
  title: string;
  nodes: GrabNode[];
  links: LinkMap;
  created_at: number;
  updated_at: number;
  ver: string;
};

export type GrabDAGHead = Omit<GrabDAG, "nodes" | "links">;

export type DAGHeadLister = FB.ObjectLister<GrabDAGHead>;
export function spawn_lister(user: Auth.User) {
  return new FB.ObjectLister<GrabDAGHead>(firestore().collection(`user/${user.uid}/dag_head`));
}


export type ResizeMode = "n" | "w" | "s" | "e"
  | "nw" | "sw" | "se" | "ne";

export type ActionMode = "neutral" | "move" | "resize" | "link";

/**
 * 点(px, py) を通り、その点から (vx, vy) の方位に延びる直線(向きあり)
 */
type LineParameter = {
  px: number;
  py: number;
  vx: number;
  vy: number;
}
// 情報量は Vector と同じだが、ニュアンスが異なるので Vector とは別の型にしておく

/**
 * 2つの直線の交点を求める
 * 交点がない場合は null を返す
 * 
 */
function crossing_point(v: LineParameter, w: LineParameter) {
  // - 上記以外 -> 1点で交わる

  const cross = v.vx * w.vy - v.vy * w.vx;
  if (cross === 0) {
    // - v, w が平行
    const u = {
      px: w.px - v.px,
      py: w.py - v.py,
      vx: w.vx - v.px,
      vy: w.vy - v.py,
    };
    const u_cross = u.px * u.vy - u.py * u.vx;
    if (u_cross === 0) {
      // - v, w が平行かつ重なっている -> 全ての点で交わる
      return null;
    } else {
      // - v, w が平行かつ重なっていない -> 交わらない
      return null;
    }
  }

  // s = ( (v0.x - w0.x) * w1.y - (v0.y - w0.y) * w1.x) ) / (v1.x * w1.y - v1.y * w1.x)
  const sd = (v.py - w.py) * w.vx - (v.px - w.px) * w.vy;
  const sn = cross;
  const s = sd / sn;
  return _.isFinite(s) ? {
    x: v.px + v.vx * s,
    y: v.py + v.vy * s,
    s,
  } : null;
}

/**
 * ベクトル *vector* が定義する線分と *node*の張る矩形領域との交点のうち、ベクトル *vector* の根元に近いものを探す
 */
export function collision_point(vector: Vector, node: GrabNode) {
  const r = Math.sqrt(Math.pow(vector.to.x - vector.from.x, 2) + Math.pow(vector.to.y - vector.from.y, 2));
  const dx = (vector.to.x - vector.from.x);
  const dy = (vector.to.y - vector.from.y);

  const lines: LineParameter[] = [
    { px: node.x, py: node.y, vx: 1, vy: 0 },
    { px: node.x, py: node.y, vx: 0, vy: 1 },
    { px: node.x + node.width, py: node.y + node.height, vx: 1, vy: 0 },
    { px: node.x + node.width, py: node.y + node.height, vx: 0, vy: 1 },
  ];

  const epsilon = 0.001;
  const edge_lines = _(lines).map(w => crossing_point({
    px: vector.from.x, py: vector.from.y, vx: dx, vy: dy,
  }, w)).compact().filter(crossing => {
    return -epsilon <= crossing.s && crossing.s <= 1 + epsilon // crossing は vectorが乗っている直線に乗っているが、それが線分 vector 上にあるかどうか
        && (crossing.x - node.x >= -epsilon) // crossing が矩形 node の境界線上にあるかどうか
        && (crossing.y - node.y >= -epsilon)
        && (node.x + node.width - crossing.x >= -epsilon)
        && (node.y + node.height - crossing.y >= -epsilon)
  }).sortBy(crossing => {
    return Math.pow(crossing.x - vector.from.x, 2) + Math.pow(crossing.y - vector.from.y, 2)
  }).value();
  if (edge_lines.length === 0) { return null; }
  return {
    x: edge_lines[0].x,
    y: edge_lines[0].y,
  };
}

export function new_dag(id?: string): GrabDAG {
  return {
    id: id || `dag_${U.u_shorten_uuid(uuid.v4()).substring(0,8)}`,
    title: "",
    nodes: [],
    links: {},
    created_at: 0,
    updated_at: 0,
    ver: dag_version,
  };
}

export function post_dag(user: Auth.User, dag: GrabDAG) {
  const now = Date.now();
  dag.created_at = dag.created_at || now;
  dag.updated_at = now;
  return firestore().collection(`user/${user.uid}/dag`).doc(dag.id).set(dag);
}

export async function get_dag(user: Auth.User, dag_id: string) {
  const doc = await firestore().collection(`user/${user.uid}/dag`).doc(dag_id).get();
  return doc.exists ? doc.data() : null;
}

const d3_dag = require("d3-dag");

export function topological_sort(nodes: GrabNode[], link_map: LinkMap, reverse_link_map: LinkMap) {
  const node_map = _.keyBy(nodes, n => n.id);
  const sorted: GrabNode[] = [];
  const reverse_link_count = _.mapValues(reverse_link_map, v => Object.keys(v).length);
  let froms: GrabNode[] = nodes.filter(n => !reverse_link_count[n.id]);
  for(let i = 0; i < nodes.length; ++i) {
    const f = froms.shift();
    if (!f) { break; }
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

export function align_by_d3_dag(sorted_nodes: GrabNode[], link_map: LinkMap, reverse_link_map: LinkMap) {
  const dagger = d3_dag.dagStratify();
  const dag = dagger(
    sorted_nodes.map(n => ({
      id: n.id,
      parentIds: Object.keys(reverse_link_map[n.id] || {}),
    }))
  );
  let wmax = 0;
  let hmax = 0;
  let xmin = Infinity;
  let ymin = Infinity;
  let xmax = -Infinity;
  let ymax = -Infinity;
  sorted_nodes.forEach(n => {
    if (n.x < xmin) { xmin = n.x }
    if (n.y < ymin) { ymin = n.y }
    if (xmax < n.x) { xmax = n.x }
    if (ymax < n.y) { ymax = n.y }
    if (wmax < n.width) { wmax = n.width }
    if (hmax < n.height) { hmax = n.height }
  });
  console.log({ wmax, hmax })
  const layouter = d3_dag.sugiyama(dag).nodeSize([hmax + 50, wmax + 50]);
  layouter(dag);

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

export function survey_reachablility(origin_node: GrabNode, node_map: NodeMap, link_map: LinkMap) {
  const reachable_node: { [key: string]: number } = {};
  const neighboring_node: { [key: string]: GrabNode } = {};
  const neighboring_link: { [key: string]: GrabLink } = {};
  const connected_link: { [key: string]: GrabLink } = {};
  let deps: { [key: string]: GrabNode } = { [origin_node.id]: origin_node };
  let distance = 0;
  while (Object.keys(deps).length > 0) {
    distance += 1;
    const d2: { [key: string]: GrabNode } = {};
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
            neighboring_node[tid] = node_map[tid];
          }
          connected_link[link_id] = link;
          if (reachable_node[tid]) { continue }
          d2[tid] = node_map[tid];
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

export function linkable(from: GrabNode, to: GrabNode, link_map: LinkMap) {
  if (from.id === to.id) { return false; }
  // **現在のグラフはDAGであると仮定する**

  // from -> to の辺があるとNG
  // (経路はあってもよい)
  if (link_map[from.id]) {
    if (link_map[from.id][to.id]) {
      return false;
    }
  }
  // to -> from の経路があるとNG
  // (もちろん辺もNG)
  const visited: { [key: string]: boolean } = {};
  let deps: { [key: string]: true } = { [to.id]: true };
  while (Object.keys(deps).length > 0) {
    const d2: { [key: string]: true } = {};
    for (const fid of Object.keys(deps)) {
      if (fid === from.id) { return false; }
      if (visited[fid]) { continue; }
      visited[fid] = true;
      const submap = link_map[fid];
      if (submap) {
        for(const tid of Object.keys(submap)) {
          d2[tid] = true;
        };
      }
    };
    deps = d2;
  }

  if (link_map[to.id]) {
    if (link_map[to.id][from.id]) {
      return false;
    }
  }
  return true;
}

export function snap_to(
  t: Point,
  node: GrabNode,
  x_sorted_nodes: { t: number, node: GrabNode }[],
  y_sorted_nodes: { t: number, node: GrabNode }[]
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

  // // [Firebase I/O]
  // private initiate() {
  //   this.dag = D.new_dag()
  //   this.nodes = this.dag.nodes;
  //   this.link_map = this.dag.links;
  //   const N = 30;
  //   const R = N * 50 * 1.2 / 2 / Math.PI;
  //   const L = 10;
  //   _.range(0, N).forEach(i => {
  //     const r = R;
  //     const t = 2 * Math.PI / N * i;
  //     this.add_new_node({
  //       title: `#${i+1}`,
  //       x: 10 + i % L * 80,
  //       y: 10 + Math.floor(i / L) * 80,
  //       // x: 400 + r * Math.cos(t),
  //       // y: 400 + r * Math.sin(t),
  //     });
  //   });
  //   _.range(0, N * 3).forEach(() => {
  //     const i = Math.floor(Math.random() * this.nodes.length);
  //     const j = Math.floor(Math.random() * this.nodes.length);
  //     this.set_link(this.nodes[i], this.nodes[j]);
  //   });
  //   this.flush_graph()
  // }
