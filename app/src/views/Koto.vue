<template lang="pug">
#factor
  .panel
    v-btn(@click="edit_new_koto") new Koto
  .kotolist
    .kotoitem(v-for="koto in docs" :key="koto.id")
      | {{ koto.created_at }} {{ koto.title }} {{ koto.id }}

  v-dialog(v-model="show_new_koto" max-width=800)
    v-card.user
      ValidationObserver(ref="obs" v-slot="ObserverProps")
        v-card-title 
          h3 Koto
        v-card-text(style="text-align:left;")
          ValidationProvider(name="タイトル" rules="required" v-slot="{ errors }")
            v-text-field(v-model="newKoto.title" type="text" label="タイトル" :error-messages="errors")
          ValidationProvider(name="内容" rules="required" v-slot="{ errors }")
            v-textarea(v-model="newKoto.body" label="内容" :error-messages="errors")
        v-card-actions
          v-btn(@click="show_new_koto = false") 閉じる
          v-btn(@click="post_koto" :disabled="ObserverProps.invalid || !ObserverProps.validated" :loading="koto_working") 保存

</template>

<script lang="ts">
import * as _ from "lodash";
import { Prop, Component, Vue } from 'vue-property-decorator';
import firebase from "firebase";
import * as F from "@/models/koto"
import { extend, ValidationProvider, ValidationObserver } from 'vee-validate';
import { required } from 'vee-validate/dist/rules';
extend('required', required);

@Component({
  components: {
    ValidationProvider, ValidationObserver,
  }
})
export default class Koto extends Vue {

  // -- new Koto --
  show_new_koto = false;
  newKoto: F.Koto = F.Koto.spawn();
  edit_new_koto() {
    this.show_new_koto = true;
  }

  async post_koto() {
    if (this.newKoto) {
      await this.lister.save(this.newKoto);
      this.show_new_koto = false;
      this.newKoto = F.Koto.spawn();
    }
  }

  // -- Kotos IO --
  lister!: F.FirestoreObjectLister<F.Koto>;
  unsubscriber!: () => void;
  docs: F.Koto[] = []
  koto_working = false;

  // -- LifeCycle Hooks --
  async mounted() {

    // -- lister --
    // setup
    this.lister = F.Koto.lister("_testuser_");
    this.lister.option.saveStatusCallback = (status) => this.koto_working = status === "working";
    this.lister.option.snapshotCallback = (change) => {
      const { doc, object } = change;
      console.log(`[!!] ${change.type} ${change.object.id}`)
      switch (change.type) {
      case "added":
      case "modified":
        (() => {
          const i = this.docs.findIndex(d => d.id === doc.id)
          if (0 <= i) {
            this.docs.splice(i, 1, object);
          } else {
            this.docs.splice(0, 0, object);
          }
        })()
        break
      case "removed":
        (() => {
          const i = this.docs.findIndex(d => d.id === doc.id)
          if (0 <= i) {
            this.docs.splice(i,1)
          }
        })()
        break
      }
    };

    // fetch
    (await this.lister.fetch()).forEach(d => this.docs.push(d));
    this.unsubscriber = this.lister.snapshot();
  }
}
</script>

<style scoped lang="stylus">
#factor
  display flex;
  flex-direction column;
  position relative;
  height 100%;
  background-color white;
</style>
