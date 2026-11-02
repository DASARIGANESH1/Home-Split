/** Domain types mirroring the backend API responses. All money is integer cents. */

export interface Home {
  id: string;
  name: string;
  createdAt: string;
}

export interface HomeWithMembers extends Home {
  members: Member[];
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

export interface ApiError {
  error: string;
  message: string;
}
