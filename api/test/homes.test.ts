import { describe, expect, it } from 'vitest';
import { addMember, api, apiJson, createHome } from './setup';

describe('POST /api/homes', () => {
  it('creates a home and returns 201 with id + name + createdAt', async () => {
    const { status, body } = await apiJson<{ id: string; name: string; createdAt: string }>(
      'POST',
      '/api/homes',
      { body: { name: 'Apartment 4A' } },
    );
    expect(status).toBe(201);
    expect(body.id).toMatch(/^[A-Za-z0-9_]{16,}$/);
    expect(body.name).toBe('Apartment 4A');
    expect(typeof body.createdAt).toBe('string');
  });

  it('rejects missing name with 400', async () => {
    const { status, body } = await apiJson<{ error: string }>('POST', '/api/homes', { body: {} });
    expect(status).toBe(400);
    expect(body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects blank name with 400', async () => {
    const res = await api('POST', '/api/homes', { body: { name: '   ' } });
    expect(res.status).toBe(400);
  });

  it('rejects non-string name with 400', async () => {
    const res = await api('POST', '/api/homes', { body: { name: 42 } });
    expect(res.status).toBe(400);
  });

  it('rejects missing body with 400', async () => {
    const res = await api('POST', '/api/homes');
    expect(res.status).toBe(400);
  });

  it('trims surrounding whitespace', async () => {
    const { status, body } = await apiJson<{ name: string }>('POST', '/api/homes', {
      body: { name: '  Beach House  ' },
    });
    expect(status).toBe(201);
    expect(body.name).toBe('Beach House');
  });
});

describe('GET /api/health', () => {
  it('returns ok', async () => {
    const { status, body } = await apiJson<{ status: string }>('GET', '/api/health');
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
  });
});

describe('GET /api/homes/:homeId', () => {
  it('returns the complete home with its persisted members in position order', async () => {
    const home = await createHome('Shared Apartment');
    const alice = await addMember(home.id, 'Alice');
    const bob = await addMember(home.id, 'Bob');

    const { status, body } = await apiJson<{
      id: string;
      name: string;
      createdAt: string;
      members: { id: string; homeId: string; name: string; position: number }[];
    }>('GET', `/api/homes/${home.id}`);

    expect(status).toBe(200);
    expect(body).toMatchObject({
      id: home.id,
      name: 'Shared Apartment',
      members: [
        { id: alice.id, homeId: home.id, name: 'Alice', position: 0 },
        { id: bob.id, homeId: home.id, name: 'Bob', position: 1 },
      ],
    });
    expect(body.createdAt).toEqual(expect.any(String));
  });

  it('returns 404 for an unknown home', async () => {
    const { status, body } = await apiJson<{ error: string }>('GET', '/api/homes/no-such-home');
    expect(status).toBe(404);
    expect(body.error).toBe('HOME_NOT_FOUND');
  });
});
