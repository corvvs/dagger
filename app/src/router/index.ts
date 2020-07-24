import Vue from 'vue';
import VueRouter, { RouteConfig } from 'vue-router';
import Koto from '../views/Koto.vue';
import Draw from '../views/Draw.vue';
import DraggableList from '../views/DraggableList.vue';
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
    path: "/ldag",
    name: "DraggableList",
    component: DraggableList,
  },
  {
    path: "/dag/:dag_id",
    name: "Draggable",
    props: true,
    component: Draggable,
  },
];

const router = new VueRouter({
  mode: 'history',
  base: process.env.BASE_URL,
  routes,
});

export default router;
