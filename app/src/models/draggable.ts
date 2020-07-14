import _ from "lodash";

export type Point = {
  x: number;
  y: number;
}

export type Vector = {
  c1: Point;
  c2: Point;
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

export type GrabLink = {
  from_id: string;
  to_id: string;
};

export type LinkBind = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
}

export type ResizeMode = "n" | "w" | "s" | "e"
  | "nw" | "sw" | "se" | "ne";

export type SelectionMode = "move" | "resize" | "link";

export type LineParameter = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * 2つの直線の交点を求める
 */
function crossing_point(v: LineParameter, w: LineParameter) {
  // s = ( (v0.x - w0.x) * w1.y - (v0.y - w0.y) * w1.x) ) / (v1.x * w1.y - v1.y * w1.x)
  const sd = (v.y0 - w.y0) * w.x1 - (v.x0 - w.x0) * w.y1;
  const sn = (v.x1 * w.y1 - v.y1 * w.x1);
  const s = sd / sn;
  return _.isFinite(s) ? {
    x: v.x0 + v.x1 * s,
    y: v.y0 + v.y1 * s,
    s,
  } : null;
}

/**
 * ベクトル *vector* が定義する線分と *node*の張る矩形領域との交点のうち、ベクトル *vector* の根元に近いものを探す
 */
export function collision_point(vector: Vector, node: GrabNode) {
  const r = Math.sqrt(Math.pow(vector.c2.x - vector.c1.x, 2) + Math.pow(vector.c2.y - vector.c1.y, 2));
  const dx = (vector.c2.x - vector.c1.x);
  const dy = (vector.c2.y - vector.c1.y);

  const lines: LineParameter[] = [
    { x0: node.x, y0: node.y, x1: 1, y1: 0 },
    { x0: node.x, y0: node.y, x1: 0, y1: 1 },
    { x0: node.x + node.width, y0: node.y + node.height, x1: 1, y1: 0 },
    { x0: node.x + node.width, y0: node.y + node.height, x1: 0, y1: 1 },
  ];

  const epsilon = 0.001;
  const edge_lines = _(lines).map(w => crossing_point({
    x0: vector.c1.x, y0: vector.c1.y, x1: dx, y1: dy,
  }, w)).compact().filter(crossing => {
    return -epsilon <= crossing.s && crossing.s <= 1 + epsilon
        && (crossing.x - node.x >= -epsilon)
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
