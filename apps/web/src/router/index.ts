import { createRouter, createWebHistory } from 'vue-router'
import OverviewView from '../views/OverviewView.vue'

// Feature routes (profiles, devices, packs, pihole) land with the web shell ticket.
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'overview',
      component: OverviewView,
    },
  ],
})

export default router
