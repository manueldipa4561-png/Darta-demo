// Edge Functions deploy as separate bundles, so a few small files are copied into each. They must stay identical.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../supabase/functions/${p}`, import.meta.url), 'utf8');

const copies = { 'cors.ts': ['darta-order', 'darta-wallet'], 'stripe-api.ts': ['darta-stripe-webhook', 'darta-order'] };
for (const [file, dirs] of Object.entries(copies)) {
  test(`${file} is the same in every function folder that uses it`, () => {
    const canonical = read(`darta-checkout/${file}`);
    for (const dir of dirs) assert.equal(read(`${dir}/${file}`), canonical, `${dir}/${file} drifted`);
  });
}
