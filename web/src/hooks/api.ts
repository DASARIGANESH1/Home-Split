import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ApiClientError, api, newIdempotencyKey } from '../services/api';
import type { Bill, Home, HomeBalances, HomeWithMembers, Member } from '../types';

/** All query keys live in one place for invalidation. */
export const qk = {
  homes: ['homes'] as const,
  home: (id: string) => ['home', id] as const,
  balances: (id: string) => ['balances', id] as const,
  bill: (id: string) => ['bill', id] as const,
};

// --------------------------------------------------------------- homes ----
export function useCreateHome() {
  const qc = useQueryClient();
  return useMutation<Home, ApiClientError, string>({
    mutationFn: (name) => api.createHome(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.homes }),
  });
}

export function useHome(homeId: string, enabled = true) {
  return useQuery<HomeWithMembers, ApiClientError>({
    queryKey: qk.home(homeId),
    queryFn: () => api.getHome(homeId),
    enabled,
    retry: false,
  });
}

// -------------------------------------------------------------- members ----
export function useAddMember(homeId: string) {
  const qc = useQueryClient();
  return useMutation<Member, ApiClientError, string>({
    mutationFn: (name) => api.addMember(homeId, name),
    onSuccess: async (member) => {
      qc.setQueryData<HomeWithMembers>(qk.home(homeId), (home) =>
        home && !home.members.some((existing) => existing.id === member.id)
          ? { ...home, members: [...home.members, member] }
          : home,
      );
      qc.setQueryData<HomeBalances>(qk.balances(homeId), (balances) => {
        if (!balances || balances.members.some((existing) => existing.memberId === member.id)) {
          return balances;
        }
        return {
          ...balances,
          members: [
            ...balances.members,
            {
              memberId: member.id,
              memberName: member.name,
              totalShare: 0,
              paidAmount: 0,
              outstandingBalance: 0,
            },
          ],
        };
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.home(homeId) }),
        qc.invalidateQueries({ queryKey: qk.balances(homeId) }),
      ]);
    },
  });
}

// ---------------------------------------------------------------- bills ----
export function useCreateBill(homeId: string) {
  const qc = useQueryClient();
  return useMutation<Bill, ApiClientError, { title: string; totalAmount: number }>({
    mutationFn: ({ title, totalAmount }) => api.createBill(homeId, title, totalAmount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.home(homeId) });
      qc.invalidateQueries({ queryKey: qk.balances(homeId) });
    },
  });
}

export function useBill(billId: string, enabled = true) {
  return useQuery<Bill, ApiClientError>({
    queryKey: qk.bill(billId),
    queryFn: () => api.getBill(billId),
    enabled,
    placeholderData: keepPreviousData,
    retry: false,
  });
}

// ------------------------------------------------------------- payments ----
export function usePayShare(homeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ billId, shareId }: { billId: string; shareId: string }) =>
      api.payShare(billId, shareId, newIdempotencyKey()),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.bill(vars.billId) });
      qc.invalidateQueries({ queryKey: qk.balances(homeId) });
    },
  });
}

// ------------------------------------------------------------- balances ----
export function useBalances(homeId: string, enabled = true) {
  return useQuery<HomeBalances, ApiClientError>({
    queryKey: qk.balances(homeId),
    queryFn: () => api.getBalances(homeId),
    enabled,
    retry: false,
  });
}
