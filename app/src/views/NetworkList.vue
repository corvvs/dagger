<template lang="pug">
.self
  .panel
    v-btn(@click="new_item") new Network
  .list
    .schema
      .time 作成
      .short_text タイトル
      .id ID
      .typename
    .item(v-for="item in lister.items" :key="item.id" @click="view_item(item)")
      .time {{ format_epoch(item.created_at, "YY/MM/DD hh:mm:ss") }}
      .short_text(:title="item.title") {{ item.title }}
      .id {{ item.id }}
      .typename {{ typename(item.type) }}


</template>

<script lang="ts">
import * as _ from "lodash";
import moment from "moment";
import { reactive, ref, Ref, SetupContext, defineComponent, onMounted, PropType, watch } from '@vue/composition-api';
import * as N from "@/models/network"
import * as Auth from "@/models/auth";
import * as F from "@/formatter"
import * as FB from "@/models/fb";

export default defineComponent({
  props: {
    auth_state: {
      type: Object as PropType<Auth.AuthState>,
      required: true,
    },
  },

  setup(props: {
    auth_state: Auth.AuthState;
  }, context: SetupContext) {
    const lister = FB.useObjectLister(context, user => N.Network.spawn_lister(user));
    onMounted(() => {
      if (props.auth_state.user) {
        lister.changed_user(props.auth_state)
      }
    });
    watch(() => props.auth_state.user, () => lister.changed_user(props.auth_state))
    return {
      ...lister,
      ...F.useFormatter(),
      view_item: (item: N.Network.Head) => {
        context.root.$router.push(`/net/${item.id}`)
      },
      new_item: () => {
        const item = N.Network.spawn();
        context.root.$router.push(`/net/${item.id}`)
      },
      typename: (t: any) => (N.Network.typeName as any)[t],
    };
  },
});
</script>

<style scoped lang="stylus">
.self
  display flex;
  flex-direction column;
  position relative;
  height 100%;
  background-color white;

.list
  .schema, .item
    display flex
    flex-direction row
    align-items center

    height 2em
    > div
      padding 4px
    .time
      width 8rem
    .short_text
      width 18rem
  .item
    &:hover
      background-color lightgreen
    cursor pointer

    .time
      font-size smaller
    .short_text
      overflow hidden
      text-overflow ellipsis
      word-break keep-all
      word-wrap none
      white-space nowrap
</style>
