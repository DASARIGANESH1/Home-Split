import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routeTree } from '../routeTree.gen';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('home members', () => {
  it('renders a new member immediately while home and balance refetches are pending', async () => {
    const user = userEvent.setup();
    const homeId = `member-test-${Date.now()}`;
    const home = {
      id: homeId,
      name: 'Test Home',
      createdAt: '2025-01-01T00:00:00.000Z',
    };
    const member = {
      id: 'member-maya',
      homeId,
      name: 'Maya',
      position: 0,
      createdAt: '2025-01-02T00:00:00.000Z',
    };
    let persisted = false;
    const requestedUrls: string[] = [];
    const pendingRefetches: (() => void)[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url === `/api/homes/${homeId}/members` && init?.method === 'POST') {
          persisted = true;
          return Response.json(member, { status: 201 });
        }
        if (url === `/api/homes/${homeId}`) {
          const response = () => Response.json({ ...home, members: persisted ? [member] : [] });
          if (persisted) {
            return new Promise<Response>((resolve) =>
              pendingRefetches.push(() => resolve(response())),
            );
          }
          return response();
        }
        if (url === `/api/homes/${homeId}/balances`) {
          const response = () =>
            Response.json({
              homeId,
              members: [],
              totals: { totalBilled: 0, totalPaid: 0, totalOutstanding: 0 },
            });
          if (persisted) {
            return new Promise<Response>((resolve) =>
              pendingRefetches.push(() => resolve(response())),
            );
          }
          return response();
        }
        throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${url}`);
      }),
    );
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [`/homes/${homeId}`] }),
    });
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: 'Test Home' })).toBeInTheDocument();
    await waitFor(() => {
      expect(requestedUrls).toContain(`/api/homes/${homeId}/balances`);
    });
    await user.click(screen.getByRole('button', { name: '+ Member' }));
    await user.type(screen.getByPlaceholderText('e.g. Alice, Bob, Carol'), 'Maya');
    await user.click(screen.getByRole('button', { name: 'Add member' }));

    expect(await screen.findByText('Maya')).toBeInTheDocument();
    await waitFor(() => {
      expect(pendingRefetches).toHaveLength(2);
    });
    expect(requestedUrls).toContain(`/api/homes/${homeId}/members`);
    expect(requestedUrls.every((url) => !url.includes('/homes//'))).toBe(true);
    for (const release of pendingRefetches) release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Maya')).toBeInTheDocument();
  });

  it('renders persisted members returned by the home detail request on a fresh page load', async () => {
    const homeId = `member-refresh-test-${Date.now()}`;
    const member = {
      id: 'member-alex',
      homeId,
      name: 'Alex',
      position: 0,
      createdAt: '2025-01-02T00:00:00.000Z',
    };
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url === `/api/homes/${homeId}`) {
          return Response.json({
            id: homeId,
            name: 'Persisted Home',
            createdAt: '2025-01-01T00:00:00.000Z',
            members: [member],
          });
        }
        if (url === `/api/homes/${homeId}/balances`) {
          return Response.json({
            homeId,
            members: [
              {
                memberId: member.id,
                memberName: member.name,
                totalShare: 0,
                paidAmount: 0,
                outstandingBalance: 0,
              },
            ],
            totals: { totalBilled: 0, totalPaid: 0, totalOutstanding: 0 },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [`/homes/${homeId}`] }),
    });
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: 'Persisted Home' })).toBeInTheDocument();
    expect(await screen.findByText('Alex')).toBeInTheDocument();
    expect(requestedUrls).toContain(`/api/homes/${homeId}`);
  });
});
