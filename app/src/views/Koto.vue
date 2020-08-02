<template lang="pug">
#factor
  .panel
    v-btn(@click="edit_new_item") new Koto
  .kotolist
    .kotoschema
      .time 作成
      .short_text タイトル
      .id ID
    .kotoitem(v-for="koto in lister.items" :key="koto.id" @click="view_item(koto)")
      .time {{ format_epoch(koto.created_at, "YY/MM/DD hh:mm:ss") }}
      .short_text(:title="koto.title") {{ koto.title }}
      .id {{ koto.id }}



  v-dialog(v-model="show_new_item" max-width=800)
    v-card.koto
      v-card-title 
        h3 {{ newItem.title  || '新しいKoto' }}
        v-btn(large icon @click="new_mode = 'view'" :color="new_mode === 'view' ? 'orange' : ''")
          v-icon visibility
        v-btn(large icon @click="new_mode = 'edit'" :color="new_mode === 'edit' ? 'blue' : ''")
          v-icon edit
        v-chip(small :color="`${new_mode === 'view' ? 'orange' : 'blue'} white--text`") {{ new_mode === "view" ? "プレビュー" : "作成" }}

      template(v-if="new_mode == 'view'")
        v-card-text(style="text-align:left;")
          .kotopreview(v-html="newItemHTML")
      template(v-if="new_mode == 'edit'")
        v-card-text(style="text-align:left;")
          v-text-field(v-model="newItem.title" type="text" label="タイトル" :error-messages="newItemError ? newItemError.title : ''")
          v-textarea(v-model="newItem.body" label="内容" outlined)

      v-card-text 
        h5 ID: {{ newItem.id }}
      v-card-actions
        v-btn(@click="show_new_item = false") 閉じる
        v-btn(@click="post_koto(newItem)" :disabled="!!newItemError" :loading="koto_working") 保存



  v-dialog(v-model="show_existing_item" max-width=800)
    v-card.koto(v-if="selectedItem")

      v-card-title 
        h3 {{ selectedItem.title  || '（タイトルなし）' }}
        v-btn(large icon @click="existing_mode = 'view'" :color="existing_mode === 'view' ? 'orange' : ''")
          v-icon visibility
        v-btn(large icon @click="existing_mode = 'edit'" :color="existing_mode === 'edit' ? 'blue' : ''")
          v-icon edit
        v-chip(small :color="`${existing_mode === 'view' ? 'orange' : 'blue'} white--text`") {{ existing_mode === "view" ? "プレビュー" : "編集" }}

      template(v-if="existing_mode == 'view'")
        v-card-text(style="text-align:left;")
          .kotopreview(v-html="selectedItemHTML")
      template(v-if="existing_mode == 'edit'")
        v-card-text(style="text-align:left;")
          v-text-field(v-model="selectedItem.title" type="text" label="タイトル" :error-messages="selectedItemError ? selectedItemError.title : ''")
          v-textarea(v-model="selectedItem.body" label="内容" outlined)

      v-card-text 
        h5 ID: {{ selectedItem.id }}
      v-card-actions
        v-btn(@click="show_existing_item = false") 閉じる
        v-btn(v-if="existing_mode == 'view'" @click="delete_koto(selectedItem)" :disabled="false" :loading="koto_working" color="red white--text")
          v-icon delete
          | 削除
        v-btn(v-if="existing_mode == 'edit'" @click="patch_koto(selectedItem)" :disabled="!!selectedItemError" :loading="koto_working")
          v-icon cloud_upload
          | 保存

</template>

<script lang="ts">
import * as _ from "lodash";
import moment from "moment";
import { Prop, Component, Vue } from 'vue-property-decorator';
import firebase from "firebase";
import { reactive, ref, Ref, SetupContext, defineComponent, onMounted, PropType, watch, computed } from '@vue/composition-api';
import * as K from "@/models/koto"
import { Marked, MarkedOptions } from 'marked-ts'
import { extend, ValidationProvider, ValidationObserver } from 'vee-validate';
import { required } from 'vee-validate/dist/rules';
import * as Auth from "@/models/auth";
import * as FB from "@/models/fb";
import * as F from "@/formatter"
import * as U from "@/util";
extend('required', required);

const useNewItem = () => {
  const show_new_item = ref(false);
  const newItem = ref(K.Koto.spawn());
  const new_mode: Ref<"view" | "edit"> = ref("edit");
  return  {
    show_new_item,
    newItem,
    new_mode,

    newItemHTML: computed(() => {
      const option = new MarkedOptions()
      option.gfm = true
      // option.breaks = true,
      return Marked.parse(newItem.value.body, option);
    }),

    newItemError: computed(() => {
      return K.Koto.validate_update(newItem.value);
    }),

    edit_new_item() {
      new_mode.value = "edit";
      show_new_item.value = true;
    },
  };
};

const useEditItem = () => {
  const show_existing_item = ref(false);
  const existing_mode: Ref<"view" | "edit"> = ref("view");
  const selectedItem: Ref<K.Koto | null> = ref(null);
  return {
    show_existing_item,
    existing_mode,
    selectedItem,

    view_item(koto: K.Koto) {
      selectedItem.value = K.Koto.copy(koto);
      existing_mode.value = "view";
      show_existing_item.value = true;
    },

    selectedItemHTML: computed(() => {
      if (!selectedItem.value) { return "" }
      const option = new MarkedOptions()
      option.gfm = true
      return Marked.parse(selectedItem.value.body, option);
    }),

    selectedItemError: computed(() => {
      return K.Koto.validate_update(selectedItem.value ? selectedItem.value : undefined);
    }),

  };
};

export default defineComponent({
  components: {
    ValidationProvider, ValidationObserver,
  },

  props: {
    auth_state: {
      type: Object as PropType<Auth.AuthState>,
      required: true,
    },
  },

  setup(props: {
    auth_state: Auth.AuthState;
  }, context: SetupContext) {

    const lister = FB.useObjectLister(context, user => K.Koto.lister(user.uid));
    const unsubscriber: Ref<(() => void) | null> = ref(null);
    const docs: Ref<K.Koto[]> = ref([]);
    const koto_working = ref(false);
    onMounted(() => {
      if (props.auth_state.user) {
        lister.changed_user(props.auth_state)
      }
    });
    watch(() => props.auth_state.user, () => lister.changed_user(props.auth_state))
    
    const useNew = useNewItem();
    const useEdit = useEditItem();
    return {
      ...lister,
      koto_working,
      ...F.useFormatter(),
      ...useNew,
      ...useEdit,

      async post_koto(object: K.Koto) {
        if (!lister.lister.lister || !object) { return; }
        await lister.lister.lister.save(object);
        useNew.show_new_item.value = false;
        useNew.newItem.value = K.Koto.spawn();
      },

      async patch_koto(object: K.Koto) {
        if (!lister.lister.lister || !object) { return; }
        await lister.lister.lister.save(object);
        useEdit.show_existing_item.value = false;
        useEdit.existing_mode.value = "view";
      },

      async delete_koto(object: K.Koto) {
        if (!lister.lister.lister || !object) { return; }
        if (!confirm("削除します。よろしいですか？")){ return; }
        await lister.lister.lister.delete(object);
        useEdit.show_existing_item.value = false;
        useEdit.existing_mode.value = "view";
      },

    };
  },
});
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
