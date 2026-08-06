import type { Category, Repositories } from '@/lib/db';
import { createEntityStore } from './_entityStore';

export const useCategoryStore = createEntityStore<Category>(
  (repos: Repositories) => repos.categories,
);
