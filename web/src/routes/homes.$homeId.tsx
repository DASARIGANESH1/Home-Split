import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Button, ErrorState, Input, LoadingRow, Modal, Spinner } from '../components/ui';
import { useAddMember, useBalances, useCreateBill, useHome, usePayShare } from '../hooks/api';
import { ApiClientError, avatarColor, formatCurrency, formatDate, initials } from '../services/api';
import type { Member, Share } from '../types';

export const Route = createFileRoute('/homes/$homeId')({
  component: HomeDashboard,
});

function HomeDashboard() {
  const { homeId } = Route.useParams();
  const home = useHome(homeId);
  const balances = useBalances(homeId);

  const [memberOpen, setMemberOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);

  if (home.isLoading) {
    return (
      <div className="app-content">
        <LoadingRow label="Loading home…" />
      </div>
    );
  }
  if (home.isError || !home.data) {
    const err = home.error;
    const msg =
      err instanceof ApiClientError && err.status === 404
        ? 'This home could not be found. It may have been deleted.'
        : err instanceof ApiClientError
          ? err.message
          : 'Failed to load home.';
    return (
      <div className="app-content">
        <ErrorState message={msg} onRetry={() => home.refetch()} />
      </div>
    );
  }

  const members = home.data.members;
  const totals = balances.data?.totals;

  return (
    <div className="app-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">{home.data.name}</h1>
          <p className="page-subtitle">
            {members.length} {members.length === 1 ? 'member' : 'members'} ·{' '}
            {totals ? formatCurrency(totals.totalBilled) : '—'} total billed
          </p>
        </div>
        <div className="row">
          <Button variant="ghost" onClick={() => setMemberOpen(true)}>
            + Member
          </Button>
          <Button onClick={() => setBillOpen(true)} disabled={members.length === 0}>
            + New bill
          </Button>
        </div>
      </div>

      {/* Stat grid */}
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">Total billed</div>
          <div className="stat-value">{totals ? formatCurrency(totals.totalBilled) : '—'}</div>
          <div className="stat-meta">across all bills</div>
        </div>
        <div className="stat-card accent">
          <div className="stat-label">Paid</div>
          <div className="stat-value">{totals ? formatCurrency(totals.totalPaid) : '—'}</div>
          <div className="stat-meta">
            {totals && totals.totalBilled > 0
              ? `${Math.round((totals.totalPaid / totals.totalBilled) * 100)}% settled`
              : 'no payments yet'}
          </div>
        </div>
        <div className="stat-card danger">
          <div className="stat-label">Outstanding</div>
          <div className="stat-value">{totals ? formatCurrency(totals.totalOutstanding) : '—'}</div>
          <div className="stat-meta">still to pay</div>
        </div>
        <div className="stat-card muted">
          <div className="stat-label">Members</div>
          <div className="stat-value">{members.length}</div>
          <div className="stat-meta">in this home</div>
        </div>
      </div>

      {/* Members + balances */}
      <div className="card mb-6">
        <div className="card-header">
          <div>
            <div className="card-title">Member balances</div>
            <div className="card-subtitle">
              Per-member outstanding amount, excluding paid shares
            </div>
          </div>
        </div>
        {members.length === 0 ? (
          <div className="empty">
            <div className="empty-title">No members yet</div>
            <p className="empty-text">
              Add the people who share this home so you can split bills between them.
            </p>
            <Button variant="ghost" onClick={() => setMemberOpen(true)}>
              Add the first member
            </Button>
          </div>
        ) : balances.isLoading ? (
          <>
            <MemberNames members={members} />
            <LoadingRow label="Calculating balances…" />
          </>
        ) : balances.isError ? (
          <>
            <MemberNames members={members} />
            <ErrorState
              message={
                balances.error instanceof ApiClientError
                  ? balances.error.message
                  : 'Failed to load balances.'
              }
              onRetry={() => balances.refetch()}
            />
          </>
        ) : (
          <BalancesTable balances={balances.data!} members={members} />
        )}
      </div>

      {/* Bills */}
      <BillsSection
        homeId={homeId}
        hasMembers={members.length > 0}
        onCreate={() => setBillOpen(true)}
      />

      <AddMemberModal open={memberOpen} onClose={() => setMemberOpen(false)} homeId={homeId} />
      <CreateBillModal
        open={billOpen}
        onClose={() => setBillOpen(false)}
        homeId={homeId}
        members={members.map((m) => ({ id: m.id, name: m.name }))}
      />
    </div>
  );
}

function MemberNames({ members }: { members: Member[] }) {
  return (
    <div className="row gap-2 mb-4" style={{ flexWrap: 'wrap' }}>
      {members.map((member) => (
        <div className="row gap-2" key={member.id}>
          <span className="share-avatar" style={{ background: avatarColor(member.name) }}>
            {initials(member.name)}
          </span>
          <span className="font-bold">{member.name}</span>
        </div>
      ))}
    </div>
  );
}

function BalancesTable({
  balances,
  members,
}: {
  balances: NonNullable<ReturnType<typeof useBalances>['data']>;
  members: Member[];
}) {
  const balancesByMember = new Map(balances.members.map((balance) => [balance.memberId, balance]));
  const max = Math.max(
    1,
    ...members.map((member) => balancesByMember.get(member.id)?.totalShare ?? 0),
  );
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Member</th>
            <th>Share</th>
            <th>Paid</th>
            <th>Outstanding</th>
            <th style={{ width: '30%' }}>Progress</th>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => {
            const balance = balancesByMember.get(member.id);
            const totalShare = balance?.totalShare ?? 0;
            const paidAmount = balance?.paidAmount ?? 0;
            const outstandingBalance = balance?.outstandingBalance ?? 0;
            const pct = totalShare > 0 ? Math.round((paidAmount / totalShare) * 100) : 0;
            const widthPct = Math.round((totalShare / max) * 100);
            return (
              <tr key={member.id}>
                <td>
                  <div className="row gap-2">
                    <span className="share-avatar" style={{ background: avatarColor(member.name) }}>
                      {initials(member.name)}
                    </span>
                    <span className="font-bold">{member.name}</span>
                  </div>
                </td>
                <td className="num">{formatCurrency(totalShare)}</td>
                <td className="num">{formatCurrency(paidAmount)}</td>
                <td className="num">
                  {outstandingBalance > 0 ? (
                    <span className="badge badge-warn">
                      <span className="badge-dot" /> {formatCurrency(outstandingBalance)}
                    </span>
                  ) : (
                    <span className="badge badge-success">
                      <span className="badge-dot" /> settled
                    </span>
                  )}
                </td>
                <td>
                  <div className="row gap-2">
                    <div className="progress flex-1" style={{ width: `${widthPct}%` }}>
                      <div className="progress-bar" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-dim text-mono">{pct}%</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BillsSection({
  homeId,
  hasMembers,
  onCreate,
}: {
  homeId: string;
  hasMembers: boolean;
  onCreate: () => void;
}) {
  // We re-use the home query's data; bills are not stored there, so we display
  // a callout pointing to per-bill interactions. The dashboard focuses on
  // balances; bills are created here and the balances card updates live.
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Create a bill</div>
          <div className="card-subtitle">
            Bills split instantly and equally across all members. Remainder cents go to the first
            members.
          </div>
        </div>
        <Button onClick={onCreate} disabled={!hasMembers}>
          + New bill
        </Button>
      </div>
      {!hasMembers && (
        <div className="empty">
          <div className="empty-title">Add a member first</div>
          <p className="empty-text">
            Bills are split across members, so you need at least one member before you can create a
            bill.
          </p>
        </div>
      )}
      <p className="text-sm text-muted mt-3">
        After creating a bill, its shares appear in the member balances above. Pay individual shares
        from the bill detail view.
      </p>
      <BillDetailShortcut homeId={homeId} />
    </div>
  );
}

function BillDetailShortcut({ homeId }: { homeId: string }) {
  const [billId, setBillId] = useState('');
  const navigate = useNavigate();
  return (
    <div className="row mt-4 gap-2" style={{ flexWrap: 'wrap' }}>
      <input
        className="input"
        style={{ maxWidth: 320 }}
        placeholder="Paste a bill ID to view & pay its shares…"
        value={billId}
        onChange={(e) => setBillId(e.target.value)}
      />
      <Button
        variant="ghost"
        size="sm"
        disabled={billId.trim().length < 6}
        onClick={() => navigate({ to: '/bills/$billId', params: { billId: billId.trim() } })}
      >
        Open bill
      </Button>
      <span className="text-xs text-dim" style={{ flexBasis: '100%' }}>
        Tip: bill IDs are returned when you create a bill. Home ID:{' '}
        <code className="text-mono">{homeId}</code>
      </span>
    </div>
  );
}

// --------------------------------------------------------------- modals ----
function AddMemberModal({
  open,
  onClose,
  homeId,
}: {
  open: boolean;
  onClose: () => void;
  homeId: string;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const addMember = useAddMember(homeId);

  const submit = async () => {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a member name.');
      return;
    }
    try {
      await addMember.mutateAsync(trimmed);
      setName('');
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Could not add member.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a member"
      subtitle="Members are the people who share this home's bills."
    >
      <Input
        label="Member name"
        placeholder="e.g. Alice, Bob, Carol"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={error ?? undefined}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
      />
      <div className="modal-actions">
        <Button variant="ghost" onClick={onClose} disabled={addMember.isPending}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={addMember.isPending || !name.trim()}>
          {addMember.isPending ? (
            <>
              <Spinner /> Adding…
            </>
          ) : (
            'Add member'
          )}
        </Button>
      </div>
    </Modal>
  );
}

function CreateBillModal({
  open,
  onClose,
  homeId,
  members,
}: {
  open: boolean;
  onClose: () => void;
  homeId: string;
  members: { id: string; name: string }[];
}) {
  const [title, setTitle] = useState('');
  const [dollars, setDollars] = useState('');
  const [cents, setCents] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createBill = useCreateBill(homeId);

  const totalCents = useMemo(() => {
    const d = Number.parseInt(dollars || '0', 10);
    const c = Number.parseInt(cents || '0', 10);
    if (Number.isNaN(d) || Number.isNaN(c)) return null;
    return d * 100 + c;
  }, [dollars, cents]);

  const preview = useMemo(() => {
    if (totalCents === null || totalCents <= 0 || members.length === 0) return null;
    const base = Math.floor(totalCents / members.length);
    const rem = totalCents - base * members.length;
    return members.map((m, i) => ({
      name: m.name,
      amount: base + (i < rem ? 1 : 0),
    }));
  }, [totalCents, members]);

  const submit = async () => {
    setError(null);
    const t = title.trim();
    if (!t) {
      setError('Please enter a bill title.');
      return;
    }
    if (totalCents === null || totalCents <= 0) {
      setError('Please enter a positive amount.');
      return;
    }
    try {
      await createBill.mutateAsync({ title: t, totalAmount: totalCents });
      setTitle('');
      setDollars('');
      setCents('');
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Could not create bill.');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a bill"
      subtitle={`Split equally across ${members.length} ${members.length === 1 ? 'member' : 'members'}. Amounts are in integer cents.`}
    >
      <Input
        label="Bill title"
        placeholder="e.g. Groceries, Rent, Dinner"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
      />
      <div className="row gap-2" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <Input
            label="Amount"
            type="number"
            min="0"
            placeholder="0"
            value={dollars}
            onChange={(e) => setDollars(e.target.value)}
            suffix="dollars"
          />
        </div>
        <div style={{ flex: 1 }}>
          <Input
            label=""
            type="number"
            min="0"
            max="99"
            placeholder="00"
            value={cents}
            onChange={(e) => setCents(e.target.value)}
            suffix="cents"
          />
        </div>
      </div>

      {preview && (
        <div className="card mt-3" style={{ background: 'var(--bg-elev)', padding: '14px 16px' }}>
          <div
            className="text-xs text-dim text-mono mb-2"
            style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}
          >
            Split preview · total {totalCents !== null ? formatCurrency(totalCents) : '—'}
          </div>
          <div className="col gap-2">
            {preview.map((p) => (
              <div key={p.name} className="row-between">
                <span className="row gap-2">
                  <span
                    className="share-avatar"
                    style={{ width: 22, height: 22, fontSize: 10, background: avatarColor(p.name) }}
                  >
                    {initials(p.name)}
                  </span>
                  <span className="text-sm">{p.name}</span>
                </span>
                <span className="text-mono text-sm">{formatCurrency(p.amount)}</span>
              </div>
            ))}
            <div className="divider" />
            <div className="row-between text-sm">
              <span className="text-muted">Sum check</span>
              <span className="text-mono font-bold">
                {formatCurrency(preview.reduce((a, b) => a + b.amount, 0))}
              </span>
            </div>
          </div>
        </div>
      )}

      {error && <div className="alert alert-error mt-3">{error}</div>}

      <div className="modal-actions">
        <Button variant="ghost" onClick={onClose} disabled={createBill.isPending}>
          Cancel
        </Button>
        <Button
          onClick={submit}
          disabled={createBill.isPending || !title.trim() || totalCents === null || totalCents <= 0}
        >
          {createBill.isPending ? (
            <>
              <Spinner /> Creating…
            </>
          ) : (
            'Create bill'
          )}
        </Button>
      </div>
    </Modal>
  );
}
