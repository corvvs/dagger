import Vue from 'vue';
import VueRouter, { RouteConfig } from 'vue-router';
import Koto from '../views/Koto.vue';
Vue.use(VueRouter);

const routes: RouteConfig[] = [
  {
    path: "/f",
    name: "Koto",
    component: Koto,
  }
];

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes,
});

export default router;
