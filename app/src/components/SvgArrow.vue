<template lang="pug">
g.sharp-arrow(v-if="showable")
  line.body(
    v-bind="arrow_bind"
  )
  line.head(
    v-bind="arrowhead_bind.u"
  )
  line.head(
    v-bind="arrowhead_bind.d"
  )
  
</template>

<script lang="ts">
import _ from "lodash";
import { Prop, Component, Vue } from 'vue-property-decorator';

const defaults = {
  arrowLength: 12,
  arrowAngle: 30,
};

@Component({
  components: {
  }
})
export default class SvgArrow extends Vue {
  @Prop() name?: string;
  @Prop() x1!: number;
  @Prop() y1!: number;
  @Prop() x2!: number;
  @Prop() y2!: number;

  @Prop() arrowLength?: number;
  @Prop() arrowAngle?: number;
  @Prop() arrowheadPosition?: number; // 0 ~ 1, 0 = from, 1 = to

  @Prop() stroke?: string;
  @Prop() stroke_width?: number;

  get showable() {
    return [this.x1, this.y1, this.x2, this.y2].every(v => _.isFinite(v)) && !(this.x1 === this.x2 && this.y1 === this.y2)
  }

  get arrow_bind() {
    return {
      x1: this.x1, y1: this.y1,
      x2: this.x2, y2: this.y2,
      stroke: this.stroke,
      stroke_width: this.stroke_width,
    };
  }

  get arrow_angle() { return (_.isFinite(this.arrowAngle) ? this.arrowAngle! : defaults.arrowAngle) * Math.PI / 180; }
  get arrow_length() { return _.isFinite(this.arrowLength) ? this.arrowLength! : defaults.arrowLength; }
  get arrow_string() { return 2 * this.arrow_length / Math.sin(this.arrow_angle); }
  get arrow_headposition() { return _.isFinite(this.arrowheadPosition) ? this.arrowheadPosition! : 1; }

  get arrowhead_bind()  {
    const r = Math.sqrt(Math.pow(this.x1 - this.x2, 2) + Math.pow(this.y1 - this.y2, 2));
    const angle = this.arrow_angle;
    const length = this.arrow_length;
    const vx = (this.x1 - this.x2);
    const vy = (this.y1 - this.y2);
    const dx = vx / r * length, dy = vy / r * length;
    const ux2 = dx * Math.cos(+angle) - dy * Math.sin(+angle);
    const uy2 = dx * Math.sin(+angle) + dy * Math.cos(+angle);
    const dx2 = dx * Math.cos(-angle) - dy * Math.sin(-angle);
    const dy2 = dx * Math.sin(-angle) + dy * Math.cos(-angle);
    // console.log(this.x1, this.y1, this.x2, this.y2, r, ux2, uy2)
    const x1 = vx * (1 - this.arrow_headposition), y1 = vy * (1 - this.arrow_headposition);
    return {
      u: {
        x1: 0, y1: 0,
        x2: ux2, y2: uy2,
        stroke: this.stroke,
        stroke_width: this.stroke_width,
        transform: `translate(${this.x2 + x1},${this.y2 + y1})`,
      },
      d: {
        x1: 0, y1: 0,
        x2: dx2, y2: dy2,
        stroke: this.stroke,
        stroke_width: this.stroke_width,
        transform: `translate(${this.x2 + x1},${this.y2 + y1})`,
      },
    };
  }

  // beforeUpdate() {
  //   console.log("beforeUpdate", this.name)
  // }

  // updated() {
  //   console.log("updated", this.name)
  // }
}
</script>

<style scoped lang="stylus">
.head, .body
  pointer-events none
</style>