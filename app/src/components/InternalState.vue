<template lang="pug">
.self
  h4
    | Internal State
    v-btn(small icon @click="visibleRef = !visibleRef")
      v-icon(small) {{ visibleRef ? "visibility" : "visibility_off" }}
  .panel.status(v-if="visibleRef")
    .line
      .name Action Mode
      .value {{ state.action }}
    .line
      .name Resize Mode
      .value ({{ state.resizing_vertical }}, {{ state.resizing_horizontal }})
    .line
      .name Over Entity
      .value {{ state.over_entity || "(none)" }}
    .line
      .name Field Offset
      .value {{ offset.field || "(none)" }}
    .line
      .name Cursor Offset
      .value {{ offset.cursor || "(none)" }}
    .line
      .name Inner Offset
      .value {{ offset.inner || "(none)" }}
    .line
      .name Snap To
      .value {{ offset.snap || "(none)" }}
</template>

<script lang="ts">
import _ from "lodash";
import { Vue } from 'vue-property-decorator';
import * as U from "@/util";
import * as N from "@/models/network";
import { reactive, ref, Ref, SetupContext, defineComponent, PropType } from '@vue/composition-api';

export default defineComponent({
  props: {
    state: {
      type: Object as PropType<N.Network.InternalState>,
      required: true,
    },
    offset: {
      type: Object as PropType<N.Network.OffsetGroup>,
      required: true,
    }
  },

  setup(props: {
    state: N.Network.InternalState,
    offset: N.Network.OffsetGroup,
  }, context: SetupContext) {
    const visibleRef = ref(false);
    return {
      visibleRef,
    }
  }
});
</script>

<style scoped lang="stylus">
.self
  flex-direction column !important
.panel.status
  display flex
  flex-direction column
  .line
    display flex
    flex-direction row
    width 100%
    .name
      text-align left
      font-weight bold
      flex-shrink 0
      flex-grow 0
    .value
      overflow hidden
      text-align right
      flex-shrink 1
      flex-grow 1
</style>
