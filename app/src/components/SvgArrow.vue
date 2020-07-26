<template lang="pug">
g.sharp-arrow(v-if="status && showable && g_bind" v-bind="g_bind")
  line.shaft(v-bind="shaft_bind")
  line.head(v-bind="arrowhead_bind.u")
  line.head(v-bind="arrowhead_bind.d")
  text(v-if="text_attr" v-bind="text_attr.bind") {{ text_attr.text }}
</template>

<script lang="ts">
import _ from "lodash";
import * as D from "@/models/draggable";
import { reactive, ref, Ref, SetupContext, defineComponent, onMounted, PropType, watch, computed } from '@vue/composition-api';

const defaults = {
  arrowLength: 12,
  arrorHeadAngle: 30,
};

type ArrowStatus = {
  name?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;

  arrowLength?: number;
  arrorHeadAngle?: number;
  arrowheadPosition?: number; // 0 ~ 1, 0 = from, 1 = to

  stroke?: string;
  stroke_width?: number;
};

export default defineComponent({
  props: {
    from: {
      type: Object as PropType<D.GrabNode>
    },
    to: {
      type: Object as PropType<D.GrabNode>
    },
    status: {
      type: Object as PropType<ArrowStatus>,
    },
  },

  setup(prop: {
    from: D.GrabNode,
    to: D.GrabNode,
    status: ArrowStatus;
  }, context: SetupContext) {

    /**
     * 鏃の開き角
     */
    const arrowhead_angle = computed(() => {
      const status = prop.status;
      return (_.isFinite(status.arrorHeadAngle) ? status.arrorHeadAngle! : defaults.arrorHeadAngle) * Math.PI / 180;
    });
    /**
     * 鏃の長さ
     */
    const arrowhead_length = computed(() => {
      const status = prop.status;
      return _.isFinite(status.arrowLength) ? status.arrowLength! : defaults.arrowLength;
    });
    /**
     * 鏃が矢本体のどの位置から出るか(0-1)
     */
    const arrow_headposition = computed(() => {
      const status = prop.status;
      return _.isFinite(status.arrowheadPosition) ? status.arrowheadPosition! : 1;
    });
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

      const cp1 = D.collision_point({ from: c2, to: c1 }, prop.from);
      const cp2 = D.collision_point({ from: c1, to: c2 }, prop.to);
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

    return {
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

      /**
       * 
       */
      shaft_bind: computed(() => {
        const status = prop.status;
        const vector = arrow_vector.value
        if (!vector) { return null; }
        const r = Math.sqrt(Math.pow(vector.x2 - vector.x1, 2) + Math.pow(vector.y2 - vector.y1, 2));
        return {
          x1: 0, y1: 0, x2: r, y2: 0,
          stroke: status.stroke,
          stroke_width: status.stroke_width,
        };
      }),

      arrowhead_bind: computed(() => {
        const status = prop.status;
        const vector = arrow_vector.value;
        if (!vector) { return null }
        const vx = (vector.x2 - vector.x1);
        const vy = (vector.y2 - vector.y1);
        const angle = arrowhead_angle.value;
        const length = arrowhead_length.value;
        const r = Math.sqrt(Math.pow(vx, 2) + Math.pow(vy, 2));
        const dx = length; const dy = 0;
        const xc = dx * Math.cos(angle); const ys = dy * Math.sin(angle);
        const xs = dx * Math.sin(angle); const yc = dy * Math.cos(angle);
        const head_x = r * (1 - arrow_headposition.value);
        return {
          u: {
            x1: head_x, y1: 0,
            x2: head_x + xc - ys, y2: xs + yc,
            stroke: status.stroke,
            stroke_width: status.stroke_width,
          },
          d: {
            x1: head_x, y1: 0,
            x2: head_x + xc + ys, y2: -xs + yc,
            stroke: status.stroke,
            stroke_width: status.stroke_width,
          },
        };
      }),

      text_attr: computed(() => {
        const status = prop.status;
        const text = status.name || "TEST";
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
.head, .shaft
  pointer-events none
</style>