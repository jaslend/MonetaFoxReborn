import type { Budget, Repositories } from '@/lib/db';
import { createEntityStore } from './_entityStore';

export const useBudgetStore = createEntityStore<Budget>(
  (repos: Repositories) => repos.budgets,
);
