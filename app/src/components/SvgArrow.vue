<template lang="pug">
component.arrow(
  :is="status.type"
  v-bind="prop"
  v-on="listeners"
)
</template>

<script lang="ts">
import _ from "lodash";
import * as D from "@/models/draggable";
import * as Arrow from "@/models/arrow";
import Direct from "@/components/arrow/direct.vue"
import Parallel from "@/components/arrow/parallel.vue"
import { reactive, ref, Ref, SetupContext, defineComponent, onMounted, PropType, watch, computed } from '@vue/composition-api';

export default defineComponent({
  components: {
    direct: Direct, parallel: Parallel,
  },

  props: {
    from: {
      type: Object as PropType<D.GrabNode>
    },
    to: {
      type: Object as PropType<D.GrabNode>
    },
    arrow_id: {
      type: String
    },
    status: {
      type: Object as PropType<Arrow.ArrowStatus<Arrow.ArrowData>>,
    },
    selected: { type: Boolean, },
    over: { type: Boolean, },
  },

  setup(prop: any, context: SetupContext) {
    return {
      prop: reactive(prop),
      listeners: { ...context.listeners },
    };
  }
});
</script>
