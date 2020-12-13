<template lang="pug">
.panel
  .subpanel
    .line
      .name Selected Link
      .value {{ link.id }}
    v-text-field(v-model="appearance.title" label="Link Title")
    h5 Type: {{ appearance.arrow.type }}
    v-btn-toggle(v-model="appearance.arrow.type" mandatory dense tile @change="update_link(link.id)")
      v-btn(light small text value="direct")
        v-icon arrow_forward
      v-btn(light small text value="parallel")
        v-icon subdirectory_arrow_right
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
    appearance: {
      type: Object as PropType<N.Network.LinkAppearance>,
      required: true,
    }
  },

  setup(props: {
    link: N.Network.Link,
    appearance: N.Network.LinkAppearance,
  }, context: SetupContext) {
    return {
      update_link: (link_id: string) => {
        context.emit("update_link", { link_id });
      },
    }
  }
});
</script>

<style scoped lang="stylus">
</style>
