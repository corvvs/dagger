import Vue from 'vue';
import App from './App.vue';
import router from './router';
import vuetify from './plugins/vuetify';
import VueCompositionApi from '@vue/composition-api';


// Initialize Firebase
import * as firebase from 'firebase'
const config = {
  apiKey: "AIzaSyBJA2A6pKYgMcGO5HCUNusxF4MSvCYFtgA",
  authDomain: "dagger-dev.firebaseapp.com",
  databaseURL: "https://dagger-dev.firebaseio.com",
  projectId: "dagger-dev",
  storageBucket: "dagger-dev.appspot.com",
  messagingSenderId: "308238239018",
  appId: "1:308238239018:web:76ae58c4102e57dd7b0a53"
};
firebase.initializeApp(config);

Vue.use(VueCompositionApi);
Vue.config.productionTip = false;

new Vue({
  router,
  vuetify,
  render: (h) => h(App)
}).$mount('#app');
