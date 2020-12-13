<template lang="pug">
.link-panel
  v-btn(small icon tile
    color="red"
    @click="$emit('tbLinkAction', { event: $event, action: 'delete', link })"
    title="削除"
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
    link: {
      type: Object as PropType<N.Network.Link>,
      required: true,
    },
    state: {
      type: Object as PropType<N.Network.InternalState>,
      required: true,
    },
  },

  setup(props: {
    link: N.Network.Link,
  }, context: SetupContext) {

  }
});
</script>

<style scoped lang="stylus">
  .link-panel
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
