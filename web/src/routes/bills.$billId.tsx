import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, ErrorState, LoadingRow, Spinner } from '../components/ui';
import { useBill, useHome, usePayShare } from '../hooks/api';
import { ApiClientError, avatarColor, formatCurrency, formatDate, initials } from '../services/api';
import type { Share } from '../types';

export const Route = createFileRoute('/bills/$billId')({
  component: BillDetail,
});

function BillDetail() {
  const { billId } = Route.useParams();
  const bill = useBill(billId);
  const home = useHome(bill.data?.homeId ?? '', !!bill.data);
  const payShare = usePayShare(bill.data?.homeId ?? '');

  const [payingId, setPayingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    kind: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  if (bill.isLoading)
    return (
      <div className="app-content">
        <LoadingRow label="Loading bill…" />
      </div>
    );
  if (bill.isError || !bill.data) {
    const msg =
      bill.error instanceof ApiClientError && bill.error.status === 404
        ? 'This bill could not be found.'
        : bill.error instanceof ApiClientError
          ? bill.error.message
          : 'Failed to load bill.';
    return (
      <div className="app-content">
        <ErrorState message={msg} onRetry={() => bill.refetch()} />
      </div>
    );
  }

  const b = bill.data;
  const paidCount = b.shares.filter((s) => s.paid).length;
  const totalPaid = b.shares.filter((s) => s.paid).reduce((a, s) => a + s.amount, 0);
  const pct = b.totalAmount > 0 ? Math.round((totalPaid / b.totalAmount) * 100) : 0;

  const onPay = async (share: Share) => {
    setPayingId(share.id);
    setToast(null);
    try {
      await payShare.mutateAsync({ billId: b.id, shareId: share.id });
      setToast({ kind: 'success', message: `${share.memberName}'s share marked as paid.` });
    } catch (e) {
      const msg =
        e instanceof ApiClientError
          ? e.status === 409
            ? 'This share was already paid with a different key.'
            : e.message
          : 'Payment failed. Please try again.';
      setToast({ kind: 'error', message: msg });
    } finally {
      setPayingId(null);
    }
  };

  return (
    <div className="app-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">{b.title}</h1>
          <p className="page-subtitle">
            {home.data?.name ?? 'Home'} · created {formatDate(b.createdAt)}
          </p>
        </div>
        <div className="text-right">
          <div
            className="text-xs text-dim text-mono"
            style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}
          >
            Total
          </div>
          <div className="page-title">{formatCurrency(b.totalAmount)}</div>
        </div>
      </div>

      {/* Progress */}
      <div className="card mb-6">
        <div className="row-between mb-2">
          <div className="text-sm text-muted">
            {paidCount} of {b.shares.length} shares paid · {formatCurrency(totalPaid)} of{' '}
            {formatCurrency(b.totalAmount)}
          </div>
          <div className="text-mono text-sm font-bold">{pct}%</div>
        </div>
        <div className="progress">
          <div className="progress-bar" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {toast && (
        <div
          className={`alert alert-${toast.kind === 'success' ? 'success' : toast.kind === 'error' ? 'error' : 'info'}`}
        >
          {toast.message}
        </div>
      )}

      {/* Shares */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title">Shares</div>
            <div className="card-subtitle">
              Pay each share individually. Payments are idempotent and safe under concurrent
              requests.
            </div>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Paid at</th>
                <th style={{ width: 1 }} />
              </tr>
            </thead>
            <tbody>
              {b.shares.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="row gap-2">
                      <span
                        className="share-avatar"
                        style={{ background: avatarColor(s.memberName) }}
                      >
                        {initials(s.memberName)}
                      </span>
                      <span className="font-bold">{s.memberName}</span>
                    </div>
                  </td>
                  <td className="num">{formatCurrency(s.amount)}</td>
                  <td>
                    {s.paid ? (
                      <span className="badge badge-success">
                        <span className="badge-dot" /> Paid
                      </span>
                    ) : (
                      <span className="badge badge-warn">
                        <span className="badge-dot" /> Outstanding
                      </span>
                    )}
                  </td>
                  <td className="num text-muted">
                    {s.paid && s.paidAt ? formatDate(s.paidAt) : '—'}
                  </td>
                  <td>
                    {s.paid ? (
                      <span className="badge badge-muted">settled</span>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => onPay(s)}
                        disabled={payingId === s.id || payShare.isPending}
                      >
                        {payingId === s.id ? (
                          <>
                            <Spinner /> Paying…
                          </>
                        ) : (
                          'Pay'
                        )}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
