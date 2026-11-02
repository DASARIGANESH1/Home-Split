export function Spinner({ className }: { className?: string }) {
  return <span className={`spinner ${className ?? ''}`} aria-hidden="true" />;
}

export function LoadingRow({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-row">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert-error">
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
