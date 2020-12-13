<template lang="pug">
.panel
  h4 Network
  .subpanel
    v-text-field(v-model="net.title" label="Graph Title")
  .subpanel
    v-select(
      v-model="net.type" label="Network Type"
      :items="net_type_item"
      :readonly="!changable_net_type"
    )

</template>

<script lang="ts">
import _ from "lodash";
import { Vue } from 'vue-property-decorator';
import * as U from "@/util";
import * as N from "@/models/network";
import { reactive, ref, Ref, SetupContext, defineComponent, PropType, computed, } from '@vue/composition-api';

export default defineComponent({
  props: {
    net: {
      type: Object as PropType<N.Network.NetData>,
      required: true,
    },
    changable_net_type: {
      type: Boolean,
      required: true,
    },
  },

  setup(props: {
    net: N.Network.NetData,
    changable_net_type: boolean,
  }, context: SetupContext) {
    return {
      net_type_item: computed(() => (["UD", "F", "D", "DA"] as const).map(type => ({ value: type, text: N.Network.typeName[type] }))),
    }
  }
});
</script>

<style scoped lang="stylus">
</style>
