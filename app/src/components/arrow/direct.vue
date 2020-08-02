<template lang="pug">
g.direct-arrow(v-if="status && showable && g_bind" v-bind="g_bind")
  line.shaft(v-bind="shaft_bind")
  polyline.head(v-bind="arrowhead_bind")
  text(v-if="text_attr" v-bind="text_attr.bind") {{ text_attr.text }}
  g.out
    rect(
      v-bind="out_bind"
      @mousedown.stop="mouseDown($event)"
      @mouseenter.stop="mouseEnter($event)"
      @mouseleave.stop="mouseLeave($event)"
    )
</template>

<script lang="ts">
import _ from "lodash";
import * as D from "@/models/draggable";
import * as Arrow from "@/models/arrow";
import * as G from "@/models/geo";
import { reactive, ref, Ref, SetupContext, defineComponent, onMounted, PropType, watch, computed } from '@vue/composition-api';

type CustomArrow = Arrow.DirectArrow;
type Status = Arrow.ArrowStatus<CustomArrow>;

export default defineComponent({
  props: {
    from: {
      type: Object as PropType<D.GrabNode>
    },
    to: {
      type: Object as PropType<D.GrabNode>
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
    from: D.GrabNode;
    to: D.GrabNode;
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
      return { x1: cp1.x, y1: cp1.y, x2: cp2.x, y2: cp2.y };
    });

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
      const vector = arrow_vector.value
      if (!vector) { return null; }
      const r = Math.sqrt(Math.pow(vector.x2 - vector.x1, 2) + Math.pow(vector.y2 - vector.y1, 2));
      return {
        x1: 0, y1: 0, x2: r, y2: 0,
        ...Arrow.svg_attr_binder(status),
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
          transform: `translate(${vector.x2},${vector.y2}) rotate(${arrow_angle.value!})`,
        };
      }),

      shaft_bind,

      out_bind: computed(() => {
        const shaft = shaft_bind.value;
        if (!shaft) { return null }
        const thickness = 8;
        return {
          x: shaft.x1 - thickness,
          y: shaft.y1 - thickness,
          width: shaft.x2 - shaft.x1 + 2 * thickness,
          height: shaft.y2 - shaft.y1 + 2 * thickness,
          opacity: prop.selected ? 1 : prop.over ? 0.8 : 0,
        }
      }),

      arrowhead_bind: computed(() => {
        const status = prop.status;
        const vector = arrow_vector.value;
        if (!vector) { return null }
        const vx = (vector.x2 - vector.x1);
        const vy = (vector.y2 - vector.y1);
        const angle = arrow_head.arrowhead_angle.value;
        const length = arrow_head.arrowhead_length.value;
        const r = Math.sqrt(Math.pow(vx, 2) + Math.pow(vy, 2));
        const dx = length; const dy = 0;
        const xc = dx * Math.cos(angle); const ys = dy * Math.sin(angle);
        const xs = dx * Math.sin(angle); const yc = dy * Math.cos(angle);
        const head_x = r * (1 - arrow_head.arrow_headposition.value);
        return {
          points: [
            [head_x + xc + ys, -xs + yc],
            [head_x, 0],
            [head_x + xc - ys, xs + yc],
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
        const r = Math.sqrt(Math.pow(vector.x1 - vector.x2, 2) + Math.pow(vector.y1 - vector.y2, 2));
        const flip = _.isFinite(arrow_angle.value) && Math.abs(arrow_angle.value!) >= 90;
        return {
          bind: {
            transform: `translate(${r / 2}) scale(${flip ? -1 : +1}, ${flip ? -1 : +1}) translate(0,-10)`,
            fill: "black",
            "text-anchor": "middle",
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
    rect
      fill rgba(1,1,1,0)
      stroke #bbb
      stroke-width 1px
</style>