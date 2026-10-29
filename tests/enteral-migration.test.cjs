const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const migrationFile = fs.readdirSync(path.join(__dirname, '..', 'supabase', 'migrations')).find(name => name.endsWith('_enteral_label_basis.sql'));
const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', migrationFile), 'utf8');

test('label energy migration preserves legacy quantities, rejects invalid bases, and is repeatable', async () => {
    const db = new PGlite();
    try {
        await db.exec(`create table public.enteral_nutrients (
            drug_code text primary key, macros jsonb, vitamins jsonb, minerals jsonb, specials jsonb, updated_at timestamptz
        );
        insert into public.enteral_nutrients values ('OLD', '{"Protein":4,"Fat":0}', '{"Trace":"<0.01 mg"}', '{}', '{}', '2026-10-28T00:00:00Z');`);
        const before = (await db.query('select * from public.enteral_nutrients')).rows[0];
        await db.exec(migration);
        const after = (await db.query('select * from public.enteral_nutrients')).rows[0];
        const { base_kcal, ...unchanged } = after;
        assert.equal(Number(base_kcal), 100);
        assert.deepEqual(unchanged, before);
        await db.query(`insert into public.enteral_nutrients (drug_code, base_kcal, macros) values ('LABEL', 250, '{"Protein":"10.00"}')`);
        const calculated = (await db.query(`select (macros->>'Protein')::numeric * 100 / base_kcal as per_100 from public.enteral_nutrients where drug_code='LABEL'`)).rows[0];
        assert.equal(Number(calculated.per_100), 4);
        for (const value of ['0', '-1', 'NaN', 'Infinity', '-Infinity']) {
            await assert.rejects(db.query(`update public.enteral_nutrients set base_kcal=$1::numeric where drug_code='LABEL'`, [value]), /constraint/);
        }
        await assert.rejects(db.query(`update public.enteral_nutrients set base_kcal=null where drug_code='LABEL'`), /not-null|null value/);
        await db.exec(migration);
        const label = (await db.query(`select base_kcal, macros from public.enteral_nutrients where drug_code='LABEL'`)).rows[0];
        assert.equal(Number(label.base_kcal), 250);
        assert.equal(label.macros.Protein, '10.00');
    } finally { await db.close(); }
});
