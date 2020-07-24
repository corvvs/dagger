import firebase from "firebase";
import { reactive, ref, Ref, SetupContext, watch } from '@vue/composition-api';

export type User = {
  uid: string;
  email: string;
};

export type AuthState = {
  user: User | null;
  authstate: "Authenticated" | "Unauthenticated" | "Unknown";
  observing: boolean;
};

/**
 * ログイン/ログアウトを取り扱う
 */
export const useUserAuth = (context: SetupContext) => {
  const auth_state: AuthState = reactive({
    user: null,
    authstate: "Unknown",
    observing: false,
  });

  const user_login_state = reactive({
    mail: "",
    password: "",
    working: false,
  });

  function observeUser() {
    if (auth_state.observing) { return; }
    auth_state.observing = true;
    firebase.auth().onAuthStateChanged((u: firebase.User | null) => {
      console.log(u)
      if (u) {
        auth_state.authstate = "Authenticated";
        auth_state.user = { uid: u.uid, email: u.email!,};
      } else {
        auth_state.authstate = "Unauthenticated";
        auth_state.user = null;
      }
    });
  }

  async function login() {
    if (auth_state.user || user_login_state.working) { return; }
    try {
      const mail = user_login_state.mail.trim();
      const password = user_login_state.password.trim();
      console.log({ mail, password });
      if (!mail || !password) { return; }
      user_login_state.working = true;
      const userCredential = await firebase.auth().signInWithEmailAndPassword(mail, password);
      console.log(userCredential);
      context.emit("pop_snackbar", { text: "ログインしました" });
    } catch (e) {
      console.error(e);
      context.emit("pop_snackbar", { text: "失敗しました" });
    }
    user_login_state.working = false;
  }

  async function logout() {
    if (!auth_state.user || user_login_state.working) { return; }
    try {
      user_login_state.working = true;
      await firebase.auth().signOut()
      context.emit("pop_snackbar", { text: "ログアウトしました" });
    } catch (e) {
      console.error(e);
      context.emit("pop_snackbar", { text: "失敗しました" });
    }
    user_login_state.working = false;
  }

  return {
    auth_state,
    user_login_state,

    observeUser,
    login,
    logout,
  };
};

