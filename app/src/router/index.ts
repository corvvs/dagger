import Vue from 'vue';
import VueRouter, { RouteConfig } from 'vue-router';
import Koto from '../views/Koto.vue';
import Draw from '../views/Draw.vue';
import NetworkList from '../views/NetworkList.vue';
import Network from '../views/Network.vue';
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
    path: "/net",
    name: "NetworkList",
    component: NetworkList,
  },
  {
    path: "/net/:id",
    name: "Network",
    props: true,
    component: Network,
  },
];

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes,
});

export default router;
