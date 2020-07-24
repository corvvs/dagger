<template lang="pug">
g.sharp-arrow(v-if="showable")
  line.body(v-bind="arrow_bind")
  line.head(v-bind="arrowhead_bind.u")
  line.head(v-bind="arrowhead_bind.d")
</template>

<script lang="ts">
import _ from "lodash";
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
    status: {
      type: Object as PropType<ArrowStatus>,
    },
  },

  setup(prop: {
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
    return {
      showable: computed(() => {
        const status = prop.status;
        return [status.x1, status.y1, status.x2, status.y2].every(v => _.isFinite(v)) && !(status.x1 === status.x2 && status.y1 === status.y2)
      }),
      arrow_bind: computed(() => {
        const status = prop.status;
        return {
          x1: status.x1, y1: status.y1,
          x2: status.x2, y2: status.y2,
          stroke: status.stroke,
          stroke_width: status.stroke_width,
        };
      }),

      arrowhead_bind: computed(() => {
        const status = prop.status;
        const vx = (status.x1 - status.x2);
        const vy = (status.y1 - status.y2);
        const angle = arrow_angle.value;
        const length = arrow_length.value;
        const r = length / Math.sqrt(Math.pow(vx, 2) + Math.pow(vy, 2));
        const dx = vx * r, dy = vy * r;
        const xc = dx * Math.cos(angle); const ys = dy * Math.sin(angle);
        const xs = dx * Math.sin(angle); const yc = dy * Math.cos(angle);
        const left_x2 = +xc - ys;
        const left_y2 = +xs + yc;
        const right_x2 = +xc + ys;
        const right_y2 = -xs + yc;
        // console.log(status.x1, status.y1, status.x2, status.y2, r, ux2, uy2)
        const head_x = vx * (1 - arrow_headposition.value), head_y = vy * (1 - arrow_headposition.value);
        return {
          u: {
            x1: 0, y1: 0,
            x2: left_x2, y2: left_y2,
            stroke: status.stroke,
            stroke_width: status.stroke_width,
            transform: `translate(${status.x2 + head_x},${status.y2 + head_y})`,
          },
          d: {
            x1: 0, y1: 0,
            x2: right_x2, y2: right_y2,
            stroke: status.stroke,
            stroke_width: status.stroke_width,
            transform: `translate(${status.x2 + head_x},${status.y2 + head_y})`,
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