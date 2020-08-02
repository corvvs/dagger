<template lang="pug">
v-app#app
  v-navigation-drawer(v-model="navState.drawer" :mini-variant.sync="navState.mini" app light stateless)
    v-list.pt-0(dense)
      v-list-item(@click.stop="navState.mini = true; go('/f')")
        v-list-item-icon
          v-icon format_list_bulleted
      v-list-item(@click.stop="navState.mini = true; go('/ldag')")
        v-list-item-icon
          v-icon share
      v-list-item(@click.stop="navState.mini = true; go('/net')")
        v-list-item-icon
          v-icon share
      v-list-item(@click.stop="navState.show_user = true")
        v-list-item-icon
          v-icon person
        v-list-item-content
          v-list-item-title User

  v-main.content
    keep-alive
      router-view(v-on:snackon="pop_snackbar" :auth_state="auth_state")

  v-snackbar.snackbar(v-model="snackbar.on" :timeout="snackbar.timeout" multi-line=true :color="snackbar.cssclass" bottom)
    = "{{ snackbar.text }}"
    v-btn(dark depressed @click="snackbar.on = false") 閉じる

  v-dialog(v-model="navState.show_user" max-width=800 style="z-index: 10000;")
    v-card.user
      form
        v-card-title 
          h3 ユーザアカウント
        v-card-text(style="text-align:left;")
          .logout(v-if="auth_state.user")
            h4 ログイン中: {{ auth_state.user.email }}
          .login(v-else)
            h4 ログイン
            v-text-field(v-model="user_login_state.mail" type="mail" label="メールアドレス" placeholder="xxxx@example.com")
            v-text-field(v-model="user_login_state.password" type="password" label="パスワード")
        v-card-actions
          v-btn(@click="navState.show_user = false") 閉じる
          template(v-if="auth_state.user")
            v-btn(:loading="user_login_state.working" :disabled="user_login_state.working" @click="logout" color="blue primary") ログアウト
          template(v-else)
            v-btn(:loading="user_login_state.working" :disabled="user_login_state.working" @click="login" color="blue primary") ログイン

</template>

<script lang="ts">
import firebase from "firebase";
import { reactive, ref, Ref, SetupContext, defineComponent, onMounted, } from '@vue/composition-api';
import * as Auth from "@/models/auth";

const useNav = (context: SetupContext) => {
  const navState = reactive({
    drawer: true,
    mini: true,
    show_user: false,
  });

  const snackbar = reactive({
    on: false,
    timeout: 3000,
    text: "",
    cssclass: "",
  });

  function pop_snackbar(payload: { text: string, cssclass?: string }) {
    console.log(payload)
    snackbar.text = payload.text
    snackbar.cssclass = payload.cssclass || ""
    snackbar.on = true
  }

  function go(path: string) {
    context.root.$router.push(path)
  }

  return {
    navState,
    snackbar,
    pop_snackbar,
    go,
  };
};

export default defineComponent({

  setup(props: {}, ctx: SetupContext) {
    console.log(props, ctx);
    const userAuth = Auth.useUserAuth(ctx);

    onMounted(() => {
      userAuth.observeUser()
    })

    return {
      ...useNav(ctx),
      ...userAuth,
    }
  }
});

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
