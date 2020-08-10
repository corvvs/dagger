<template lang="pug">
g.direct-arrow(v-if="status && showable && g_bind" v-bind="g_bind")
  polyline.shaft(v-bind="shaft_bind")
  polyline.head(v-if="!status.headless" v-bind="arrowhead_bind")
  text(v-if="text_attr" v-bind="text_attr.bind") {{ text_attr.text }}
  g.out
    polyline(
      v-bind="out_bind"
      @mousedown.stop="mouseDown($event)"
      @mouseenter.stop="mouseEnter($event)"
      @mouseleave.stop="mouseLeave($event)"
    )
</template>

<script lang="ts">
import _ from "lodash";
import * as G from "@/models/geo";
import * as N from "@/models/network";
import * as Arrow from "@/models/arrow";
import { reactive, ref, Ref, SetupContext, defineComponent, onMounted, PropType, watch, computed } from '@vue/composition-api';

type CustomArrow = Arrow.ParallelArrow;
type Status = Arrow.ArrowStatus<CustomArrow>;

export default defineComponent({
  props: {
    from: {
      type: Object as PropType<N.Network.Node>
    },
    to: {
      type: Object as PropType<N.Network.Node>
    },
    arrow_id: {
      type: String
    },
    status: {
      type: Object as PropType<Status>,
    },
    selected: { type: Boolean, },
    over: { type: Boolean, },
  },

  setup(prop: {
    from: N.Network.Node;
    to: N.Network.Node;
    arrow_id?: string;
    status: Status;
    selected?: boolean;
    over?: boolean;
  }, context: SetupContext) {

    /**
     * 矢本体のベクトル
     */
    const arrow_vector = computed(() => {
      const status = prop.status;
      // facing edge
      const c1 = {
        x: prop.from.x + prop.from.width / 2,
        y: prop.from.y + prop.from.height / 2,
      };

      const c2 = {
        x: prop.to.x + prop.to.width / 2,
        y: prop.to.y + prop.to.height / 2,
      };

      const cp1 = G.collision_point({ from: c2, to: c1 }, prop.from);
      const cp2 = G.collision_point({ from: c1, to: c2 }, prop.to);
      if (!cp1 || !cp2 || (cp1.x === cp2.x && cp1.y === cp2.y)) { return null }
      return { x1: cp1.x, y1: cp1.y, x2: cp2.x, y2: cp2.y, dir_from: cp1.dir, dir_to: cp2.dir };
    });

    /**
     * 折れ線の点
     */
    const arrow_points = computed(() => {
      const status = prop.status;
      // facing edge
      const c1 = {
        x: prop.from.x + prop.from.width / 2,
        y: prop.from.y + prop.from.height / 2,
      };

      const c2 = {
        x: prop.to.x + prop.to.width / 2,
        y: prop.to.y + prop.to.height / 2,
      };

      const cp1 = G.collision_point({ from: c2, to: c1 }, prop.from);
      const cp2 = G.collision_point({ from: c1, to: c2 }, prop.to);
      if (!cp1 || !cp2 || (cp1.x === cp2.x && cp1.y === cp2.y)) { return null }

      const x = cp2.x - cp1.x;
      const y = cp2.y - cp1.y;
      const r = Math.abs(x) + Math.abs(y);
      if (
        (cp1.dir === "n" && cp2.dir === "s") ||
        (cp2.dir === "n" && cp1.dir === "s") ||
        (cp1.dir === "w" && cp2.dir === "e") ||
        (cp2.dir === "w" && cp1.dir === "e")
      ) {
        // 出入りする辺が平行な場合 -> 線は3本(縮退するなら1本)
        if (cp1.dir === "w" || cp1.dir === "e") {
          // 出る辺が w or e
          return [
            { x: 0, y: 0, r: 0 },
            { x: x / 2, y: 0, r: Math.abs(x/2) / r },
            { x: x / 2, y: y, r: (Math.abs(x/2) + Math.abs(y)) / r },
            { x: x, y: y, r: 1 },
          ]
        } else {
          // 出る辺が n or s
          return [
            { x: 0, y: 0, r: 0 },
            { x: 0, y: y / 2, r: Math.abs(y/2) / r },
            { x: x, y: y / 2, r: (Math.abs(y/2) + Math.abs(x)) / r },
            { x: x, y: y, r: 1 },
          ]
        }
      } else {
        // 出入りする辺が垂直な場合 -> 線は2本
        if (cp1.dir === "w" || cp1.dir === "e") {
          // 出る辺が w or e
          return [
            { x: 0, y: 0, r: 0 },
            { x: x, y: 0, r: Math.abs(x) / r },
            { x: x, y: y, r: 1 },
          ];
        } else {
          // 出る辺が n or s
          return [
            { x: 0, y: 0, r: 0 },
            { x: 0, y: y, r: Math.abs(y) / r },
            { x: x, y: y, r: 1 },
          ];
        }
      }
1    });

    /**
     * 矢本体の角度(rad)
     */
    const arrow_angle = computed(() => {
      const vector = arrow_vector.value
      if (!vector) { return null; }
      return Math.atan2(vector.y1 - vector.y2, vector.x1 - vector.x2) * 180 / Math.PI;
    });

    const shaft_bind = computed(() => {
      const status = prop.status;
      const points = arrow_points.value
      if (!points) { return null; }
      return {
        points: points.map(p => `${p.x},${p.y}`).join(" "),
        ...Arrow.svg_attr_binder(status),
        fill: "none",
      };
    });

    const arrow_head = Arrow.useArrowHead(prop);


    return {
      ...Arrow.handlers(prop, context),

      showable: computed(() => {
        const vector = arrow_vector.value;
        return vector && [vector.x1, vector.y1, vector.x2, vector.y2].every(v => _.isFinite(v));
      }),

      g_bind: computed(() => {
        const vector = arrow_vector.value
        if (!vector) { return null; }
        return {
          transform: `translate(${vector.x1},${vector.y1})`,
        };
      }),

      shaft_bind,

      out_bind: computed(() => {
        const bind = shaft_bind.value;
        if (!bind) { return null }
        const thickness = 8;
        return {
          ...bind,
          opacity: prop.selected ? 1 : prop.over ? 0.8 : 0,
        }
      }),

      arrowhead_bind: computed(() => {
        const status = prop.status;
        const points = arrow_points.value;
        if (!points) { return null }
        const r = arrow_head.arrow_headposition.value;
        const i = points.findIndex(p => r <= p.r);
        const t = (i <= 0) ? { x: 0, y: 0, dx: 0, dy: 0, } : (() => {
          const [p2,p1] = [points[i],points[i-1]];
          return {
            x: (p2.x - p1.x) * (r - p1.r) / (p2.r - p1.r) + p1.x,
            y: (p2.y - p1.y) * (r - p1.r) / (p2.r - p1.r) + p1.y,
            dx: (p2.x - p1.x),
            dy: (p2.y - p1.y),
          };
        })();
        const arrow_angle_degree = Math.atan2(t.dy, t.dx) * 180 / Math.PI;
        const head_angle = arrow_head.arrowhead_angle.value;
        const length = arrow_head.arrowhead_length.value;
        const dx = length; const dy = 0;
        const xc = dx * Math.cos(head_angle); const ys = dy * Math.sin(head_angle);
        const xs = dx * Math.sin(head_angle); const yc = dy * Math.cos(head_angle);
        return {
          points: [
            [xc + ys, -xs + yc],
            [0, 0],
            [xc - ys, xs + yc],
          ].map(xy => `${xy[0]},${xy[1]}`).join(" "),
          fill: "none",
          ...Arrow.svg_attr_binder(status),
        };
      }),

      text_attr: computed(() => {
        const status = prop.status;
        const text = status.name;
        const vector = arrow_vector.value;
        if (!text || !vector) { return null; }
        const x = (vector.x2 - vector.x1) / 2; const y = (vector.y2 - vector.y1) / 2;
        return {
          bind: {
            transform: `translate(${x},${y})`,
            fill: "black",
            "text-anchor": "left middle",
          },
          text,
        }
      }),
    };
  }
});
</script>

<style scoped lang="stylus"> 
  text
    user-select none
  .out
    polyline
      stroke rgba(0,0,0,0.2)
      stroke-width 15px
</style>