<template lang="pug">
v-app#app
  v-navigation-drawer(v-model="drawer" :mini-variant.sync="mini" app light stateless)
    v-list.pt-0(dense)
      v-list-item(@click.stop="mini = true; go('/f')")
        v-list-item-icon
          v-icon format_list_bulleted
      v-list-item(@click.stop="mini = true; go('/d')")
        v-list-item-icon
          v-icon share
      v-list-item(@click.stop="mini = true; go('/g')")
        v-list-item-icon
          v-icon touch_app

  v-content.content
    keep-alive
      router-view(v-on:snackon="pop_snackbar" :user="user" :authstate="authstate")

  v-snackbar.snackbar(v-model="snackbar.on" :timeout="snackbar.timeout" multi-line=true :color="snackbar.cssclass" bottom)
    = "{{ snackbar.text }}"
    v-btn(dark depressed @click="snackbar.on = false") 閉じる

  v-dialog(v-model="show_user" max-width=800 style="z-index: 10000;")
    v-card.user
      form
        v-card-title 
          h3 ユーザアカウント
        v-card-text(style="text-align:left;")
          .logout(v-if="user")
            h4 ログイン中: {{ user.email }}
          .login(v-else)
            h4 ログイン
            v-text-field(v-model="user_mail" type="mail" label="メールアドレス" placeholder="xxxx@example.com")
            v-text-field(v-model="user_password" type="password" label="パスワード")
            h5 テスト用ユーザ
            ul
              li mail: yosuke+test@stily.co.jp
              li password: testtest
        v-card-actions
          v-btn(@click="show_user = false") 閉じる
          template(v-if="user")
            v-btn(:loading="user_working" :disabled="user_working" @click="logout" color="blue primary") ログアウト
          template(v-else)
            v-btn(:loading="user_working" :disabled="user_working" @click="login" color="blue primary") ログイン

</template>

<script lang="ts">
import { Prop, Component, Vue } from 'vue-property-decorator';
import firebase from "firebase";

@Component({
  components: {
  }
})
export default class App extends Vue {

  drawer = true
  mini: boolean = true
  snackbar: {
    on: boolean
    timeout: number
    text: string
    cssclass: string
  } = {
    on: false,
    timeout: 3000,
    text: "",
    cssclass: "",
  }
  show_user = false

  pop_snackbar(payload: { text: string, cssclass?: string }) {
    console.log(payload)
    this.snackbar.text = payload.text
    this.snackbar.cssclass = payload.cssclass || ""
    this.snackbar.on = true
  }

  go(path: string) {
    console.log(path, this.mini)
    this.$router.push(path)
  }


  mounted() {
    console.log(this.$root)
    this.userObserver()
  }

  user: firebase.User | null = null
  authstate: "Authenticated" | "Unauthenticated" | "Unknown" = "Unknown"
  observing = false
  userObserver() {
    if (this.observing) { return; }
    this.observing = true;
    firebase.auth().onAuthStateChanged((user: firebase.User | null) => {
      if (user) {
        this.authstate = "Authenticated";
        this.user = user;
      } else {
        this.authstate = "Unauthenticated";
        this.user = null;
      }
    });
  }

  user_mail = ""
  user_password = ""
  user_working = false
  async login() {
    if (this.user || this.user_working) { return; }
    try {
      const mail = (this.user_mail || "").trim();
      const password = (this.user_password || "").trim();
      console.log({ mail, password });
      if (!mail || !password) { return; }
      this.user_working = true;
      const userCredential = await firebase.auth().signInWithEmailAndPassword(mail, password);
      console.log(userCredential);
      this.pop_snackbar({ text: "ログインしました" });
    } catch (e) {
      console.error(e);
      this.pop_snackbar({ text: "失敗しました" });
    }
    this.user_working = false;
  }

  async logout() {
    if (!this.user || this.user_working) { return; }
    try {
      this.user_working = true;
      await firebase.auth().signOut()
      this.pop_snackbar({ text: "ログアウトしました" });
    } catch (e) {
      console.error(e);
      this.pop_snackbar({ text: "失敗しました" });
    }
    this.user_working = false;
  }

}
</script>

<style lang="stylus">
*
  box-sizing border-box
html
  height 100%
body
  height 100%
  margin 0

#app
  height 100%
  margin 0
  font-family 'Avenir', Helvetica, Arial, sans-serif
  -webkit-font-smoothing antialiased
  -moz-osx-font-smoothing grayscale
  text-align left
  color #2c3e50

  background-color #ddd
  .content, .content > *
    height 100%

  .vertical-spacer
    height 40px

  .rot90
    transform rotateZ(90deg)
</style>
