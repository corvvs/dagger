<template lang="pug">
.panel
  .subpanel
    .line
      .name Selected Node
      .value {{ node.id }}
    v-textarea(v-model="node.title" label="Node Text")
    v-btn-toggle(v-model="node.text_align" mandatory dense tile)
      v-btn(light x-small text)
        v-icon(small) format_align_left
      v-btn(light x-small text)
        v-icon(small) format_align_center
      v-btn(light x-small text)
        v-icon(small) format_align_right

</template>

<script lang="ts">
import _ from "lodash";
import { Vue } from 'vue-property-decorator';
import * as U from "@/util";
import * as N from "@/models/network";
import { reactive, ref, Ref, SetupContext, defineComponent, PropType } from '@vue/composition-api';

export default defineComponent({
  props: {
    node: {
      type: Object as PropType<N.Network.Node>,
      required: true,
    },
  },

  setup(props: {
    node: N.Network.Node,
  }, context: SetupContext) {

  }
});
</script>

<style scoped lang="stylus">
</style>
