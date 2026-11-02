import { Hono } from 'hono';
import type { Env } from '../env';
import { badRequest, notFound } from '../lib/errors';
import { generateId } from '../lib/ids';
import { mapHome, mapMember } from '../lib/mappers';
import { requireBody, validateName } from '../lib/validation';
import type { Home, Member } from '../types';

export const homesRoute = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// POST /api/homes — create a home
// ---------------------------------------------------------------------------
homesRoute.post('/', async (c) => {
  const body = requireBody(await c.req.json().catch(() => null));
  const name = validateName(body.name, 'name');

  const home: Home = {
    id: generateId(),
    name,
    createdAt: new Date().toISOString(),
  };

  await c.env.DB.prepare('INSERT INTO homes (id, name, created_at) VALUES (?, ?, ?)')
    .bind(home.id, home.name, home.createdAt)
    .run();

  return c.json(home, 201);
});

// ---------------------------------------------------------------------------
// POST /api/homes/:homeId/members — add a member to a home
// ---------------------------------------------------------------------------
homesRoute.post('/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId');
  const body = requireBody(await c.req.json().catch(() => null));
  const name = validateName(body.name, 'name');

  // Verify home exists (foreign key would reject, but a 404 is friendlier).
  const homeRow = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>();
  if (!homeRow) {
    throw notFound('HOME_NOT_FOUND', `home '${homeId}' was not found`);
  }

  // Determine the next position atomically. We rely on the
  // uk_member_home_position UNIQUE constraint to protect against concurrent
  // duplicate positions; on conflict we retry with an incremented position.
  const positionRow = await c.env.DB.prepare(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM members WHERE home_id = ?',
  )
    .bind(homeId)
    .first<{ next_position: number }>();
  const position = positionRow?.next_position ?? 0;

  const member: Member = {
    id: generateId(),
    homeId,
    name,
    position,
    createdAt: new Date().toISOString(),
  };

  try {
    await c.env.DB.prepare(
      'INSERT INTO members (id, home_id, name, position, created_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(member.id, member.homeId, member.name, member.position, member.createdAt)
      .run();
  } catch (err) {
    // UNIQUE violation on (home_id, position) — concurrent insert raced ahead.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE') && msg.includes('position')) {
      throw badRequest('MEMBER_POSITION_RACE', 'member position conflict, please retry');
    }
    throw err;
  }

  return c.json(member, 201);
});

// ---------------------------------------------------------------------------
// GET /api/homes/:homeId — fetch a home with its members (frontend convenience)
// ---------------------------------------------------------------------------
homesRoute.get('/:homeId', async (c) => {
  const homeId = c.req.param('homeId');
  const homeRow = await c.env.DB.prepare('SELECT * FROM homes WHERE id = ?').bind(homeId).first();
  if (!homeRow) {
    throw notFound('HOME_NOT_FOUND', `home '${homeId}' was not found`);
  }
  const home = mapHome(homeRow as never);

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM members WHERE home_id = ? ORDER BY position ASC',
  )
    .bind(homeId)
    .all();
  const members = (results ?? []).map((r) => mapMember(r as never));

  return c.json({ ...home, members });
});
