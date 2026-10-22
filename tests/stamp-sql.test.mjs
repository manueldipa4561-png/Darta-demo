// The real migrations and darta_add_stamp() on an in-process Postgres (PGlite). Skipped unless PGlite is available:
//   npm i --prefix /tmp/pglite @electric-sql/pglite && PGLITE=/tmp/pglite/node_modules/@electric-sql/pglite/dist/index.js node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../supabase/migrations/', import.meta.url);
const path = process.env.PGLITE;

test('darta_add_stamp: stamps, refuses doubles and an 11th, redeems, logs, and only the service role may call it', { skip: !path && 'set PGLITE to run the SQL' }, async () => {
  const { PGlite } = await import(path);
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role;');   // Supabase's roles
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(f, dir), 'utf8'));

  const { rows: [card] } = await db.query(`insert into darta_cards (name, finish, icon, barber, stamps) values ('Lorenzo', 'onyx', 'fire', 'Thomas', 0) returning id, pass_token, updated_at`);
  assert.match(card.pass_token, /^[0-9a-f]{64}$/);
  const call = async (code, action = 'stamp', gap = 10800) =>
    (await db.query('select * from darta_add_stamp($1, $2, $3, $4)', [code, action, 'Mattia', gap])).rows[0];

  assert.deepEqual(await call(card.id), { result: 'ok', card_id: card.id, stamps: 1 });
  assert.equal((await call(card.id.slice(0, 8))).result, 'too_soon');                   // same visit, typed code
  assert.equal((await call('00000000')).result, 'not_found');
  for (let n = 2; n <= 10; n++) assert.equal((await call(card.id, 'stamp', 0)).stamps, n);
  assert.equal((await call(card.id, 'stamp', 0)).result, 'card_full');
  assert.deepEqual(await call(card.id, 'redeem'), { result: 'ok', card_id: card.id, stamps: 0 });
  assert.equal((await call(card.id, 'redeem')).result, 'not_full');

  const { rows: [after] } = await db.query('select stamps, updated_at from darta_cards where id = $1', [card.id]);
  assert.equal(after.stamps, 0);
  assert.ok(after.updated_at >= card.updated_at);
  const { rows: log } = await db.query('select action, stamps_after, barber from darta_stamps order by id');
  assert.equal(log.length, 11);
  assert.deepEqual(log.at(-1), { action: 'redeem', stamps_after: 0, barber: 'Mattia' });

  await assert.rejects(call("%' or true --"), /bad stamp parameters/);
  await assert.rejects(call('%'), /bad stamp parameters/);
  // the public API roles get nothing: no function, no tables
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(call(card.id), /permission denied/);
    await assert.rejects(db.query('select * from darta_stamps'), /permission denied/);
    await assert.rejects(db.query('select * from darta_pass_devices'), /permission denied/);
    await db.exec('reset role');
  }
  await db.close();
});
