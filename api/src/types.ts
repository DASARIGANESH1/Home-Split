/**
 * Shared domain types for HomeSplit.
 *
 * All monetary values are INTEGER cents. The API never accepts or returns
 * floating-point money — see `src/lib/split.ts` for the splitting algorithm.
 */

export interface Home {
  id: string;
  name: string;
  createdAt: string;
}

export interface Member {
  id: string;
  homeId: string;
  name: string;
  position: number;
  createdAt: string;
}

export interface Share {
  id: string;
  billId: string;
  memberId: string;
  memberName: string;
  amount: number;
  paid: boolean;
  paidAt: string | null;
}

export interface Bill {
  id: string;
  homeId: string;
  title: string;
  totalAmount: number;
  createdAt: string;
  shares: Share[];
}

export interface MemberBalance {
  memberId: string;
  memberName: string;
  totalShare: number;
  paidAmount: number;
  outstandingBalance: number;
}

export interface HomeBalances {
  homeId: string;
  members: MemberBalance[];
  totals: {
    totalBilled: number;
    totalPaid: number;
    totalOutstanding: number;
  };
}

/** Request payloads — validated at the route boundary. */

export interface CreateHomeRequest {
  name: unknown;
}

export interface AddMemberRequest {
  name: unknown;
}

export interface CreateBillRequest {
  title: unknown;
  totalAmount: unknown;
}

/** Standardised API error body. */
export interface ApiErrorBody {
  error: string;
  message: string;
}
