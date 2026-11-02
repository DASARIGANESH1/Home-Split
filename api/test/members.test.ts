import { describe, expect, it } from 'vitest';
import { addMember, api, apiJson, createHome } from './setup';

describe('POST /api/homes/:homeId/members', () => {
  it('adds a member and returns 201 with a position', async () => {
    const home = await createHome('Test Home');
    const { status, body } = await apiJson<{
      id: string;
      homeId: string;
      name: string;
      position: number;
    }>('POST', `/api/homes/${home.id}/members`, { body: { name: 'Alice' } });
    expect(status).toBe(201);
    expect(body.id).toMatch(/^[A-Za-z0-9_]{16,}$/);
    expect(body.homeId).toBe(home.id);
    expect(body.name).toBe('Alice');
    expect(body.position).toBe(0);
  });

  it('preserves member ordering via incremental positions', async () => {
    const home = await createHome();
    const a = await addMember(home.id, 'Alice');
    const b = await addMember(home.id, 'Bob');
    const c = await addMember(home.id, 'Carol');
    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
    expect(c.position).toBe(2);
  });

  it('returns 404 for an unknown home', async () => {
    const { status, body } = await apiJson<{ error: string }>(
      'POST',
      '/api/homes/nonexistent-home/members',
      { body: { name: 'Alice' } },
    );
    expect(status).toBe(404);
    expect(body.error).toBe('HOME_NOT_FOUND');
  });

  it('rejects blank member name with 400', async () => {
    const home = await createHome();
    const res = await api('POST', `/api/homes/${home.id}/members`, { body: { name: '' } });
    expect(res.status).toBe(400);
  });

  it('rejects non-string member name with 400', async () => {
    const home = await createHome();
    const res = await api('POST', `/api/homes/${home.id}/members`, { body: { name: null } });
    expect(res.status).toBe(400);
  });
});
