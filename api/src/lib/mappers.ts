import type { Bill, Home, Member, Share } from '../types';

/** Raw row shapes as returned by D1 (snake_case columns). */
interface HomeRow {
  id: string;
  name: string;
  created_at: string;
}
interface MemberRow {
  id: string;
  home_id: string;
  name: string;
  position: number;
  created_at: string;
}
interface BillRow {
  id: string;
  home_id: string;
  title: string;
  total_amount: number;
  created_at: string;
}
interface ShareRow {
  id: string;
  bill_id: string;
  member_id: string;
  member_name: string;
  amount: number;
  paid_at: string | null;
  paid_idempotency_key: string | null;
}

export function mapHome(row: HomeRow): Home {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export function mapMember(row: MemberRow): Member {
  return {
    id: row.id,
    homeId: row.home_id,
    name: row.name,
    position: row.position,
    createdAt: row.created_at,
  };
}

export function mapBill(row: BillRow): Omit<Bill, 'shares'> {
  return {
    id: row.id,
    homeId: row.home_id,
    title: row.title,
    totalAmount: row.total_amount,
    createdAt: row.created_at,
  };
}

export function mapShare(row: ShareRow): Share {
  return {
    id: row.id,
    billId: row.bill_id,
    memberId: row.member_id,
    memberName: row.member_name,
    amount: row.amount,
    paid: row.paid_at !== null,
    paidAt: row.paid_at,
  };
}
