import type { Transaction, Repositories } from '@/lib/db';
import { createEntityStore } from './_entityStore';

export const useTransactionStore = createEntityStore<Transaction>(
  (repos: Repositories) => repos.transactions,
);
