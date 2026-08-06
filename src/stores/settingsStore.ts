import type { Settings, Repositories } from '@/lib/db';
import { createEntityStore } from './_entityStore';

export const useSettingsStore = createEntityStore<Settings>(
  (repos: Repositories) => repos.settings,
);
