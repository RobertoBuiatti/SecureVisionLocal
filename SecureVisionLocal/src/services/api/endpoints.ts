export const endpoints = {
  cameras: {
    list: '/cameras',
    get: (id: string) => `/cameras/${id}`,
    create: '/cameras',
    update: (id: string) => `/cameras/${id}`,
    delete: (id: string) => `/cameras/${id}`,
    status: (id: string) => `/cameras/${id}/status`,
    ptz: {
      control: (id: string) => `/cameras/${id}/ptz`,
      presets: (id: string) => `/cameras/${id}/ptz/presets`,
      preset: (id: string, presetId: string) =>
        `/cameras/${id}/ptz/presets/${presetId}`,
      tour: (id: string) => `/cameras/${id}/ptz/tour`,
    },
  },
  recordings: {
    list: '/recordings',
    get: (id: string) => `/recordings/${id}`,
    delete: (id: string) => `/recordings/${id}`,
    export: (id: string) => `/recordings/${id}/export`,
    search: '/recordings/search',
  },
  automation: {
    list: '/automation',
    get: (id: string) => `/automation/${id}`,
    create: '/automation',
    update: (id: string) => `/automation/${id}`,
    delete: (id: string) => `/automation/${id}`,
    trigger: (id: string) => `/automation/${id}/trigger`,
    history: '/automation/history',
  },
  settings: {
    get: '/settings',
    update: '/settings',
    backup: '/settings/backup',
    restore: '/settings/restore',
  },
  system: {
    status: '/system/status',
    restart: '/system/restart',
    logs: '/system/logs',
  },
} as const;