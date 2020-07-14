<template lang="pug">
g.sharp-arrow
  line(
    v-bind="arrow_bind"
  )
  line(
    v-bind="arrowhead_bind.u"
  )
  line(
    v-bind="arrowhead_bind.d"
  )
  
</template>

<script lang="ts">
import _ from "lodash";
import { Prop, Component, Vue } from 'vue-property-decorator';

const defaults = {
  arrowLength: 12,
  arrowAngle: 30 * Math.PI / 180,
};

@Component({
  components: {
  }
})
export default class SvgArrow extends Vue {
  @Prop() x1!: number;
  @Prop() y1!: number;
  @Prop() x2!: number;
  @Prop() y2!: number;

  @Prop() arrowLength?: number;
  @Prop() arrowAngle?: number;

  @Prop() stroke?: string;
  @Prop() stroke_width?: number;

  get arrow_bind() {
    return {
      x1: this.x1, y1: this.y1,
      x2: this.x2, y2: this.y2,
      stroke: this.stroke,
      stroke_width: this.stroke_width,
    };
  }

  get arrowhead_bind()  {
    const r = Math.sqrt(Math.pow(this.x1 - this.x2, 2) + Math.pow(this.y1 - this.y2, 2));
    const angle = _.isFinite(this.arrowAngle) ? this.arrowAngle! : defaults.arrowAngle;
    const length = _.isFinite(this.arrowLength) ? this.arrowLength! : defaults.arrowLength;
    const dx = (this.x1 - this.x2) / r * length, dy = (this.y1 - this.y2) / r * length;
    const ux2 = dx * Math.cos(+angle) - dy * Math.sin(+angle);
    const uy2 = dx * Math.sin(+angle) + dy * Math.cos(+angle);
    const dx2 = dx * Math.cos(-angle) - dy * Math.sin(-angle);
    const dy2 = dx * Math.sin(-angle) + dy * Math.cos(-angle);
    return {
      u: {
        x1: 0, y1: 0, x2: ux2, y2: uy2,
        stroke: this.stroke,
        stroke_width: this.stroke_width,
        transform: `translate(${this.x2},${this.y2})`,
      },
      d: {
        x1: 0, y1: 0, x2: dx2, y2: dy2,
        stroke: this.stroke,
        stroke_width: this.stroke_width,
        transform: `translate(${this.x2},${this.y2})`,
      },
    };
  }
}
</script>