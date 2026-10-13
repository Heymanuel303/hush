<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Menu } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import HushMark from './HushMark.vue'

const nav = [
  { to: '/profiles', label: 'Profiles' },
  { to: '/devices', label: 'Devices' },
  { to: '/packs', label: 'Packs' },
  { to: '/pihole', label: 'Pi-hole' },
]

const menuOpen = ref(false)
</script>

<template>
  <div class="bg-background text-foreground flex min-h-dvh flex-col">
    <header class="bg-card border-b">
      <div
        class="mx-auto flex h-14 w-full max-w-(--content-max) items-center gap-6 px-(--gutter)"
      >
        <RouterLink to="/" class="flex items-center gap-2 font-semibold">
          <HushMark :size="24" />
          <span>Hush</span>
          <span class="text-muted-foreground hidden font-normal sm:inline">Household Hub</span>
        </RouterLink>

        <nav aria-label="Main" class="hidden items-center gap-1 sm:flex">
          <RouterLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="text-muted-foreground hover:text-foreground hover:bg-muted rounded-md px-3 py-2 text-sm font-medium"
            active-class="text-foreground bg-muted"
          >
            {{ item.label }}
          </RouterLink>
        </nav>

        <div class="ml-auto flex items-center gap-2">
          <slot name="account" />

          <Sheet v-model:open="menuOpen">
            <SheetTrigger as-child>
              <Button variant="ghost" size="icon" class="sm:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" class="w-64">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
                <SheetDescription class="sr-only">Household Hub sections</SheetDescription>
              </SheetHeader>
              <nav aria-label="Main" class="flex flex-col gap-1 px-4">
                <RouterLink
                  v-for="item in nav"
                  :key="item.to"
                  :to="item.to"
                  class="text-muted-foreground hover:text-foreground hover:bg-muted rounded-md px-3 py-2 text-sm font-medium"
                  active-class="text-foreground bg-muted"
                  @click="menuOpen = false"
                >
                  {{ item.label }}
                </RouterLink>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>

    <main class="mx-auto w-full max-w-(--content-max) flex-1 px-(--gutter) py-6">
      <slot />
    </main>
  </div>
</template>
