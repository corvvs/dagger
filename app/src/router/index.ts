import Vue from 'vue';
import VueRouter, { RouteConfig } from 'vue-router';
import NetworkList from '../views/NetworkList.vue';
import Network from '../views/Network.vue';
Vue.use(VueRouter);

const routes: RouteConfig[] = [
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
