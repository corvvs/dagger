import Vue from 'vue';
import VueRouter, { RouteConfig } from 'vue-router';
import Koto from '../views/Koto.vue';
import Draw from '../views/Draw.vue';
import Draggable from '../views/Draggable.vue';
Vue.use(VueRouter);

const routes: RouteConfig[] = [
  {
    path: "/f",
    name: "Koto",
    component: Koto,
  },
  {
    path: "/d",
    name: "Draw",
    component: Draw,
  },
  {
    path: "/g",
    name: "Draggable",
    component: Draggable,
  },
];

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes,
});

export default router;
