<template lang="pug">
#draw
  .panel
    .subpanel.circle
      .sliderbox
        v-slider(v-model="circle.x" label="c.x" :min="-200" :max="200" :messages="`${circle.x}`")
      .sliderbox
        v-slider(v-model="circle.y" label="c.y" :min="-200" :max="200" :messages="`${circle.y}`")
      .sliderbox
        v-slider(v-model="circle.r" label="c.r" :min="1" :max="200" :messages="`${circle.r}`")
    .subpanel.x
      .sliderbox
        v-slider(v-model="viewBox.x" label="vb.x" :min="-viewBox.width" :max="viewBox.width" :messages="`${viewBox.x}`")
      .sliderbox
        v-slider(v-model="viewBox.width" label="vb.w" :min="1" :max="500" :messages="`${viewBox.width}`")
    .subpanel.y
      .sliderbox
        v-slider(v-model="viewBox.y" label="vb.y" :min="-viewBox.height" :max="viewBox.height" :messages="`${viewBox.y}`")
      .sliderbox
        v-slider(v-model="viewBox.height" label="vb.h" :min="1" :max="500" :messages="`${viewBox.height}`")
    .subpanel.aspectratio
      h5 viewBox
      v-btn-toggle(v-model="viewBoxOn" mandatory dense tile)
        v-btn(light small text value="on") On
        v-btn(light small text value="off") Off
      h5 PreserveAspectRatio
      v-btn-toggle(v-model="par" mandatory dense tile)
        v-btn(v-for="(name,key) in defPreserveAspectRatio" light small text :value="key") {{ name }}
      h5 meetOrSlice
      v-btn-toggle(v-model="meetOrSlice" mandatory dense tile)
        v-btn(light small text value="meet") Meet
        v-btn(light small text value="slice") Slice
      .preview
        code
          span(v-for="(value,key) in svgbind" style="margin-right: 0.5em;")
            | {{key}}="{{ value }}"

  .svgs
    svg.svgmaster
      circle(:cx="circle.x" :cy="circle.y" :r="circle.r")
      rect(:x="viewBox.x" :y="viewBox.y" :width="viewBox.width" :height="viewBox.height" fill="none" stroke="#aaa")
    svg.svgmaster(v-bind="svgbind")
      circle(:cx="circle.x" :cy="circle.y" :r="circle.r")
      rect(:x="viewBox.x" :y="viewBox.y" :width="viewBox.width" :height="viewBox.height" fill="none" stroke="#aaa")
    
</template>

<script lang="ts">
import * as _ from "lodash";
import moment from "moment";
import { Prop, Component, Vue } from 'vue-property-decorator';
import firebase from "firebase";

type Position = {
  x: number;
  y: number;
};

type Node = {

} & Position;


@Component({
  components: {
  }
})
export default class Draw extends Vue {
  viewBox = {
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  }

  circle = {
    x: 0,
    y: 0,
    r: 100,
  }

  viewBoxOn: "on" | "off" = "on"
  par: string = "xMidYMid";
  meetOrSlice: "meet" | "slice" = "meet";
  get defPreserveAspectRatio() {
    return {
      none: "none",
      xMinYMin: "xMinYMin",
      xMaxYMin: "xMaxYMin",
      xMinYMid: "xMinYMid",
      xMidYMid: "xMidYMid",
      xMaxYMid: "xMaxYMid",
      xMinYMax: "xMinYMax",
      xMidYMax: "xMidYMax",
      xMaxYMax: "xMaxYMax",
    };
  }

  get svgbind() {
    return {
      viewBox: this.viewBoxOn === 'on' ? `${this.viewBox.x}, ${this.viewBox.y}, ${this.viewBox.width}, ${this.viewBox.height}` : '',
      preserveAspectRatio: `${this.par} ${this.meetOrSlice}`,
    };
  }


  nodes: Node[] = []
}
</script>

<style scoped lang="stylus">
#draw
  display flex
  flex-direction column
  position relative
  height 100%
  background-color #fff

.panel
  flex-shrink 0
  flex-grow 0
  display flex
  align-items flex-start
  .subpanel
    flex-basis 200px
  .sliderbox
    display flex
    align-items center

.svgs
  flex-shrink 1
  flex-grow 1
  display flex
  width 100%

  .svgmaster
    border 1px solid black
    height 100%
    width 100%
    overflow hidden
</style>
