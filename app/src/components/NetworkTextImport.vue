<template lang="pug">
v-dialog.self(v-model="show" max-width=800 style="z-index: 10000;")
  v-card.user
    form
      v-card-title グラフのインポート({{ typeName }})
      v-card-text
        v-textarea(
          v-model="valueRef"
          outlined
        )
      v-card-actions
        v-btn(@click="try_import") インポート
        v-btn(@click="close") 閉じる

</template>

<script lang="ts">
import _ from "lodash";
import { Prop, Component, Vue, Watch } from 'vue-property-decorator';
import * as U from "@/util";
import * as N from "@/models/network";
import { reactive, ref, Ref, SetupContext, defineComponent, onMounted, PropType, watch, computed } from '@vue/composition-api';

export default defineComponent({
  props: {
    network_type: {
      type: String as PropType<N.Network.Type>,
      required: true,
    },
    show: {
      type: Boolean,
      required: true,
    }
  },
  setup(props: {
    network_type: N.Network.Type;
    show: Boolean;
  }, context: SetupContext) {
    const showRef = ref(false);
    const valueRef:  Ref<string> = ref("");
    watch(() => props.show, () => showRef.value = !!props.show);

    const close = () => {
      context.emit("closeImporter");
    };

    return {
      showRef,
      valueRef,
      typeName: computed(() => N.Network.typeName[props.network_type]),
      close,
      try_import: () => {
        console.log(valueRef.value);
        const result = N.Network.import_from_text(props.network_type, valueRef.value);
        if (!result) { return; }
        context.emit("parsedImporter", result);
        close();
      },
    };
  },
});
</script>