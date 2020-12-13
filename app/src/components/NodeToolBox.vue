<template lang="pug">
.node-panel
  v-btn(small icon tile
    dark
    title="ここからリンク"
    @click="$emit('tbNodeAction', { event: $event, action: 'link', node })"
    :color="state.action === 'link_from' ? 'info' : 'grey'"
  )
    v-icon(
    dark
    ) link
  v-btn(small icon tile
    dark
    title="このノードからリンクされたノードを追加"
    @click="$emit('tbNodeAction', { event: $event, action: 'add_node', node })"
    :color="state.action === 'select_node' ? 'info' : 'grey'"
    :disabled="state.action !== 'select_node'"
  )
    v-icon(
    dark
    ) add_box
  v-btn(small icon tile
    title="削除"
    color="red"
    @click="$emit('tbNodeAction', { event: $event, action: 'delete', node })"
  )
    v-icon delete
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
    state: {
      type: Object as PropType<N.Network.InternalState>,
      required: true,
    },
  },

  setup(props: {
    node: N.Network.Node,
    state: N.Network.InternalState,
  }, context: SetupContext) {

  }
});
</script>

<style scoped lang="stylus">
  .node-panel
    position absolute
    word-break keep-all
    background-color white
    white-space nowrap
    opacity 1
    transform-origin: top center;
    transform scale(+1,-1)
    border solid 1px #888
    .v-btn
      transform scale(+1,-1)
      margin 1px
</style>
