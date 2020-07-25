<template lang="pug">
g.sharp-arrow(v-if="status && showable")
  line.body(v-bind="arrow_bind")
  line.head(v-bind="arrowhead_bind.u")
  line.head(v-bind="arrowhead_bind.d")
</template>

<script lang="ts">
import _ from "lodash";
import * as D from "@/models/draggable";
import { reactive, ref, Ref, SetupContext, defineComponent, onMounted, PropType, watch, computed } from '@vue/composition-api';

const defaults = {
  arrowLength: 12,
  arrowAngle: 30,
};

type ArrowStatus = {
  name?: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;

  arrowLength?: number;
  arrowAngle?: number;
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
    const arrow_angle = computed(() => {
      const status = prop.status;
      return (_.isFinite(status.arrowAngle) ? status.arrowAngle! : defaults.arrowAngle) * Math.PI / 180;
    });
    const arrow_length = computed(() => {
      const status = prop.status;
      return _.isFinite(status.arrowLength) ? status.arrowLength! : defaults.arrowLength;
    });
    const arrow_headposition = computed(() => {
      const status = prop.status;
      return _.isFinite(status.arrowheadPosition) ? status.arrowheadPosition! : 1;
    });
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

    return {
      showable: computed(() => {
        const vector = arrow_vector.value;
        return vector && [vector.x1, vector.y1, vector.x2, vector.y2].every(v => _.isFinite(v));
      }),
      arrow_bind: computed(() => {
        const status = prop.status;
        const vector = arrow_vector.value
        if (!vector) { return null; }
        return {
          x1: vector.x1, y1: vector.y1,
          x2: vector.x2, y2: vector.y2,
          stroke: status.stroke,
          stroke_width: status.stroke_width,
        };
      }),

      arrowhead_bind: computed(() => {
        const status = prop.status;
        const vector = arrow_vector.value;
        if (!vector) { return null }

        const vx = (vector.x1 - vector.x2);
        const vy = (vector.y1 - vector.y2);
        const angle = arrow_angle.value;
        const length = arrow_length.value;
        const r = length / Math.sqrt(Math.pow(vx, 2) + Math.pow(vy, 2));
        const dx = vx * r, dy = vy * r;
        const xc = dx * Math.cos(angle); const ys = dy * Math.sin(angle);
        const xs = dx * Math.sin(angle); const yc = dy * Math.cos(angle);
        const head_x = vx * (1 - arrow_headposition.value), head_y = vy * (1 - arrow_headposition.value);
        return {
          u: {
            x1: 0, y1: 0,
            x2: xc - ys, y2: xs + yc,
            stroke: status.stroke,
            stroke_width: status.stroke_width,
            transform: `translate(${vector.x2 + head_x},${vector.y2 + head_y})`,
          },
          d: {
            x1: 0, y1: 0,
            x2: xc + ys, y2: -xs + yc,
            stroke: status.stroke,
            stroke_width: status.stroke_width,
            transform: `translate(${vector.x2 + head_x},${vector.y2 + head_y})`,
          },
        };
      }),
    };
  }
});
</script>

<style scoped lang="stylus">
.head, .body
  pointer-events none
</style>