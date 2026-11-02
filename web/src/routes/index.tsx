import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Button, Input, Spinner } from '../components/ui';
import { Modal } from '../components/ui/Modal';
import { useCreateHome } from '../hooks/api';
import { ApiClientError } from '../services/api';

export const Route = createFileRoute('/')({
  component: HomeComponent,
});

function HomeComponent() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const createHome = useCreateHome();
  const navigate = useNavigate();

  const submit = async () => {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a name for your home.');
      return;
    }
    try {
      const home = await createHome.mutateAsync(trimmed);
      setName('');
      setOpen(false);
      navigate({ to: '/homes/$homeId', params: { homeId: home.id } });
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Could not create home.');
    }
  };

  return (
    <div className="app-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Your homes</h1>
          <p className="page-subtitle">Create a home, add members, and split bills fairly.</p>
        </div>
        <Button onClick={() => setOpen(true)} disabled={createHome.isPending}>
          + New home
        </Button>
      </div>

      <div className="card">
        <div className="empty">
          <div className="empty-icon">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              role="img"
              aria-label="Home"
            >
              <path d="M3 12l9-9 9 9M5 10v10h14V10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="empty-title">Start with a home</div>
          <p className="empty-text">
            A home groups your members and bills together. Create one for your apartment, trip, or
            project to begin splitting expenses.
          </p>
          <Button onClick={() => setOpen(true)}>Create your first home</Button>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create a home"
        subtitle="Give your home a recognisable name — you can change it later."
      >
        <Input
          label="Home name"
          placeholder="e.g. Apartment 4A, Weekend Trip, Office Lunch"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error ?? undefined}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <div className="modal-actions">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={createHome.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={createHome.isPending || !name.trim()}>
            {createHome.isPending ? (
              <>
                <Spinner /> Creating…
              </>
            ) : (
              'Create home'
            )}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
