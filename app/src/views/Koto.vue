<template lang="pug">
#factor
  .panel
    v-btn(@click="edit_new_koto") new Koto
  .kotolist
    .kotoschema
      .time 作成
      .short_text タイトル
      .id ID
    .kotoitem(v-for="koto in docs" :key="koto.id" @click="view_koto(koto)")
      .time {{ timeout(koto.created_at, "YY/MM/DD hh:mm:ss") }}
      .short_text(:title="koto.title") {{ koto.title }}
      .id {{ koto.id }}



  v-dialog(v-model="show_new_koto" max-width=800)
    v-card.koto
      v-card-title 
        h3 {{ newKoto.title  || '新しいKoto' }}
        v-btn(large icon @click="new_mode = 'view'" :color="new_mode === 'view' ? 'orange' : ''")
          v-icon visibility
        v-btn(large icon @click="new_mode = 'edit'" :color="new_mode === 'edit' ? 'blue' : ''")
          v-icon edit
        v-chip(small :color="`${new_mode === 'view' ? 'orange' : 'blue'} white--text`") {{ new_mode === "view" ? "プレビュー" : "作成" }}

      template(v-if="new_mode == 'view'")
        v-card-text(style="text-align:left;")
          .kotopreview(v-html="newKotoHTML")
      template(v-if="new_mode == 'edit'")
        v-card-text(style="text-align:left;")
          v-text-field(v-model="newKoto.title" type="text" label="タイトル" :error-messages="newKotoError ? newKotoError.title : ''")
          v-textarea(v-model="newKoto.body" label="内容" outlined)

      v-card-text 
        h5 ID: {{ newKoto.id }}
      v-card-actions
        v-btn(@click="show_new_koto = false") 閉じる
        v-btn(@click="post_koto(newKoto)" :disabled="!!newKotoError" :loading="koto_working") 保存



  v-dialog(v-model="show_existing_koto" max-width=800)
    v-card.koto(v-if="selectedKoto")

      v-card-title 
        h3 {{ selectedKoto.title  || '（タイトルなし）' }}
        v-btn(large icon @click="existing_mode = 'view'" :color="existing_mode === 'view' ? 'orange' : ''")
          v-icon visibility
        v-btn(large icon @click="existing_mode = 'edit'" :color="existing_mode === 'edit' ? 'blue' : ''")
          v-icon edit
        v-chip(small :color="`${existing_mode === 'view' ? 'orange' : 'blue'} white--text`") {{ existing_mode === "view" ? "プレビュー" : "編集" }}

      template(v-if="existing_mode == 'view'")
        v-card-text(style="text-align:left;")
          .kotopreview(v-html="selectedKotoHTML")
      template(v-if="existing_mode == 'edit'")
        v-card-text(style="text-align:left;")
          v-text-field(v-model="selectedKoto.title" type="text" label="タイトル" :error-messages="selectedKotoError ? selectedKotoError.title : ''")
          v-textarea(v-model="selectedKoto.body" label="内容" outlined)

      v-card-text 
        h5 ID: {{ selectedKoto.id }}
      v-card-actions
        v-btn(@click="show_existing_koto = false") 閉じる
        v-btn(v-if="existing_mode == 'view'" @click="delete_koto(selectedKoto)" :disabled="false" :loading="koto_working" color="red white--text")
          v-icon delete
          | 削除
        v-btn(v-if="existing_mode == 'edit'" @click="patch_koto(selectedKoto)" :disabled="!!selectedKotoError" :loading="koto_working")
          v-icon cloud_upload
          | 保存

</template>

<script lang="ts">
import * as _ from "lodash";
import moment from "moment";
import { Prop, Component, Vue } from 'vue-property-decorator';
import firebase from "firebase";
import * as F from "@/models/koto"
import { Marked, MarkedOptions } from 'marked-ts'
import { extend, ValidationProvider, ValidationObserver } from 'vee-validate';
import { required } from 'vee-validate/dist/rules';
extend('required', required);

@Component({
  components: {
    ValidationProvider, ValidationObserver,
  }
})
export default class Koto extends Vue {

  // -- util --
  timeout(epoch_ms: number, format: string) {
    return moment(epoch_ms).format(format);
  }

  // -- new Koto --
  show_new_koto = false;
  newKoto: F.Koto = F.Koto.spawn();
  new_mode: "view" | "edit" = "edit";
  edit_new_koto() {
    this.new_mode = "edit";
    this.show_new_koto = true;
  }

  get newKotoHTML(): string {
    const option = new MarkedOptions()
    option.gfm = true
    // option.breaks = true
    return Marked.parse(this.newKoto.body, option);
  }

  get newKotoError() {
    return F.Koto.validate_update(this.newKoto);
  }


  async post_koto(object: F.Koto) {
    if (!object) { return; }
    await this.lister.save(object);
    this.show_new_koto = false;
    this.newKoto = F.Koto.spawn();
  }

  async patch_koto(object: F.Koto) {
    if (!object) { return; }
    await this.lister.save(object);
    this.show_existing_koto = false;
    this.existing_mode = "view";
  }

  async delete_koto(object: F.Koto) {
    if (!object) { return; }
    if (!confirm("削除します。よろしいですか？")){ return; }
    await this.lister.delete(object);
    this.show_existing_koto = false;
    this.existing_mode = "view";
  }

  // -- existing Koto --
  show_existing_koto = false;
  existing_mode: "view" | "edit" = "view";
  selectedKoto: F.Koto | null = null;
  view_koto(koto: F.Koto) {
    this.selectedKoto = F.Koto.copy(koto);
    this.existing_mode = "view";
    this.show_existing_koto = true;
  }

  get selectedKotoHTML(): string {
    if (!this.selectedKoto) { return "" }
    const option = new MarkedOptions()
    option.gfm = true
    // option.breaks = true
    return Marked.parse(this.selectedKoto.body, option);
  }

  get selectedKotoError() {
    return F.Koto.validate_update(this.selectedKoto ? this.selectedKoto : undefined);
  }

  // -- Kotos IO --
  lister!: F.FirestoreObjectLister<F.Koto>;
  unsubscriber!: () => void;
  docs: F.Koto[] = [];
  koto_working = false;

  // -- LifeCycle Hooks --
  async mounted() {

    // -- lister --
    // setup
    this.lister = F.Koto.lister("_testuser_");
    this.lister.option.saveStatusCallback = (status) => this.koto_working = status === "working";
    this.lister.option.snapshotCallback = (change) => {
      const { doc, object } = change;
      // console.log(`[!!] ${change.type} ${change.object.id}`)
      switch (change.type) {
      case "added":
      case "modified":
        (() => {
          const i = this.docs.findIndex((d) => d.id === doc.id)
          if (0 <= i) {
            this.docs.splice(i, 1, object);
          } else {
            this.docs.splice(0, 0, object);
          }
        })()
        break;
      case "removed":
        (() => {
          const i = this.docs.findIndex((d) => d.id === doc.id);
          if (0 <= i) {
            this.docs.splice(i, 1);
          }
        })();
        break;
      }
    };

    // fetch
    (await this.lister.fetch()).forEach((d) => this.docs.push(d));
    this.unsubscriber = this.lister.snapshot();
  }
}
</script>

<style lang="stylus">
.kotopreview
  pre
    display block
    code
      display block
      color white
      background-color grey
</style>

<style scoped lang="stylus">
#factor
  display flex;
  flex-direction column;
  position relative;
  height 100%;
  background-color white;

.kotolist
  .kotoschema, .kotoitem
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
  .kotoitem
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
