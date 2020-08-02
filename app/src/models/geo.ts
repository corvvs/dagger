import _ from "lodash";

export type Point = {
  x: number;
  y: number;
}

export type Vector = {
  /**
   * 始点
   */
  from: Point;
  /**
   * 終点
   */
  to: Point;
};

export type Rect = Point & {
  width: number;
  height: number;
}

export type ResizeMode = "n" | "w" | "s" | "e" | "nw" | "sw" | "se" | "ne";

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
export function collision_point(vector: Vector, node: Rect) {
  const dx = (vector.to.x - vector.from.x);
  const dy = (vector.to.y - vector.from.y);

  const lines: (LineParameter & { dir: "n" | "w" | "s" | "e" })[] = [
    { dir: "n", px: node.x, py: node.y, vx: 1, vy: 0 },
    { dir: "w", px: node.x, py: node.y, vx: 0, vy: 1 },
    { dir: "s", px: node.x + node.width, py: node.y + node.height, vx: 1, vy: 0 },
    { dir: "e", px: node.x + node.width, py: node.y + node.height, vx: 0, vy: 1 },
  ];

  const epsilon = 0.001;
  const edge_lines = _(lines).map(w => {
    const result = crossing_point({
      px: vector.from.x, py: vector.from.y, vx: dx, vy: dy,
    }, w);
    if (!result) { return result; }
    return { ...result, dir: w.dir };
  }).compact().filter(crossing => {
    return -epsilon <= crossing.s && crossing.s <= 1 + epsilon // crossing は vectorが乗っている直線に乗っているが、それが線分 vector 上にあるかどうか
        && (crossing.x - node.x >= -epsilon) // crossing が矩形 node の境界線上にあるかどうか
        && (crossing.y - node.y >= -epsilon)
        && (node.x + node.width - crossing.x >= -epsilon)
        && (node.y + node.height - crossing.y >= -epsilon)
  }).sortBy(crossing => {
    return Math.pow(crossing.x - vector.from.x, 2) + Math.pow(crossing.y - vector.from.y, 2)
  }).value();
  if (edge_lines.length === 0) { return null; }
  return _.pick(edge_lines[0], "x", "y", "dir");
}
