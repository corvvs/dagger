<template lang="pug">
.self
  .panel
    v-btn(@click="new_item") new DAG
  .list
    .schema
      .time 作成
      .short_text タイトル
      .id ID
    .item(v-for="item in items" :key="item.id" @click="view_item(item)")
      .time {{ timeout(item.created_at, "YY/MM/DD hh:mm:ss") }}
      .short_text(:title="item.title") {{ item.title }}
      .id {{ item.id }}


</template>

<script lang="ts">
import * as _ from "lodash";
import moment from "moment";
import { Prop, Component, Vue, Watch } from 'vue-property-decorator';
import firebase from "firebase";
import * as D from "@/models/draggable"

@Component({
  components: {
  }
})
export default class DraggableList extends Vue {

  // -- util --
  timeout(epoch_ms: number, format: string) {
    return moment(epoch_ms).format(format);
  }



  @Prop() user!: firebase.User | null
  @Watch("user")
  async changed_user() {
    console.log(this.user);
    if (this.user) {
      this.lister = D.spawn_lister(this.user!);
      // -- lister --
      // setup
      this.lister = D.spawn_lister(this.user!);
      this.lister.option.snapshotCallback = (change) => {
        const { doc, object } = change;
        // console.log(`[!!] ${change.type} ${change.object.id}`)
        switch (change.type) {
        case "added":
        case "modified":
          (() => {
            const i = this.items.findIndex((d) => d.id === doc.id)
            if (0 <= i) {
              this.items.splice(i, 1, object);
            } else {
              this.items.splice(0, 0, object);
            }
          })()
          break;
        case "removed":
          (() => {
            const i = this.items.findIndex((d) => d.id === doc.id);
            if (0 <= i) {
              this.items.splice(i, 1);
            }
          })();
          break;
        }
      };

      // fetch
      (await this.lister.fetch()).forEach((d) => this.items.push(d));
      this.unsubscriber = this.lister.snapshot();
    } else {
      if (this.unsubscriber) { this.unsubscriber() }
      this.lister = null;
      this.items = [];
    }
  }

  mounted() {
    if (this.user) {
      this.changed_user()
    }
  }

  // -- Kotos IO --
  lister: D.DAGHeadLister | null = null;
  unsubscriber!: () => void;
  items: D.GrabDAGHead[] = [];

  view_item(item: D.GrabDAGHead) {
    this.$router.push(`/dag/${item.id}`)
  }

  new_item() {
    const item = D.new_dag();
    this.$router.push(`/dag/${item.id}`)
  }
}
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
