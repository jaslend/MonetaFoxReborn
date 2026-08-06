import type { Account, Repositories } from '@/lib/db';
import { createEntityStore } from './_entityStore';

export const useAccountStore = createEntityStore<Account>(
  (repos: Repositories) => repos.accounts,
);
