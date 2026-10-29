const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const folder = path.join(__dirname, '..', 'supabase', 'migrations');
const migration = fs.readFileSync(path.join(folder, fs.readdirSync(folder).find(n => n.endsWith('_administration_atomic_save.sql'))), 'utf8');

async function fixture() {
    const db = new PGlite();
    await db.exec(`
        create role anon; create role authenticated;
        create schema auth;
        create function auth.jwt() returns jsonb language sql stable as $$
            select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
        $$;
        grant usage on schema public, auth to anon, authenticated;
        grant execute on function auth.jwt() to authenticated;
        create table public.drugs (drug_code text primary key);
        create table public.routes (route_code text primary key);
        create table public.fluids (short_name text primary key);
        create table public.drug_administrations (
            id bigint generated always as identity primary key,
            drug_code text references public.drugs,
            route_code text references public.routes,
            instructions text, max_conc numeric, min_conc numeric, conc_unit text,
            rank smallint default 99, updated_at timestamptz default now(), updated_by text
        );
        create table public.administration_fluids (
            administration_id bigint references public.drug_administrations on delete cascade,
            fluid_short_name text references public.fluids,
            primary key (administration_id,fluid_short_name)
        );
        create table public.audit_logs (table_name text, old_data jsonb, new_data jsonb, changed_by text);
        -- Mirrors the existing trigger's unqualified audit_logs reference.
        create function public.test_audit() returns trigger language plpgsql security definer as $$
        begin
            insert into audit_logs values (TG_TABLE_NAME, to_jsonb(OLD), to_jsonb(NEW), auth.jwt()->>'email');
            if TG_OP='DELETE' then return OLD; else return NEW; end if;
        end $$;
        create trigger audit_parent after insert or update or delete on public.drug_administrations for each row execute function public.test_audit();
        create trigger audit_fluids after insert or update or delete on public.administration_fluids for each row execute function public.test_audit();
        alter table public.drug_administrations enable row level security;
        alter table public.administration_fluids enable row level security;
        create policy read_parent on public.drug_administrations for select using (true);
        create policy write_parent on public.drug_administrations for all to authenticated using (true) with check (true);
        create policy read_fluids on public.administration_fluids for select using (true);
        create policy insert_fluids on public.administration_fluids for insert to authenticated with check (true);
        create policy delete_fluids on public.administration_fluids for delete to authenticated using (true);
        grant select,insert,update,delete on public.drug_administrations, public.administration_fluids to authenticated;
        grant select on public.drug_administrations, public.administration_fluids to anon;
        grant usage,select on all sequences in schema public to authenticated;
        insert into public.drugs values ('A'),('B');
        insert into public.routes values ('IV');
        insert into public.fluids values ('NSS'),('D5W');
        select set_config('request.jwt.claims','{"email":"editor@example.test"}',false);
    `);
    await db.exec(migration);
    return db;
}
async function call(db, { id = null, drug = 'A', text = '60 min', fluids = ['NSS'], min = null } = {}, role = 'authenticated') {
    await db.exec(`set role ${role}`);
    try {
        return (await db.query(`select public.save_administration_with_fluids($1,$2,'IV',$3,$4,null,'mg/ml',$5::text[]) as id`, [id, drug, text, min, fluids])).rows[0].id;
    } finally { await db.exec('reset role'); }
}
async function snapshot(db) {
    return (await db.query(`select
        (select jsonb_agg(to_jsonb(a) order by id) from public.drug_administrations a) parents,
        (select jsonb_agg(to_jsonb(a) order by administration_id,fluid_short_name) from public.administration_fluids a) fluids,
        (select count(*) from public.audit_logs) audits`)).rows[0];
}

test('administration RPC saves a complete selection, preserves rank, and supports empty fluids', async () => {
    const db = await fixture();
    try {
        const id = await call(db, { text: '30 min', fluids: ['NSS','D5W','NSS'] });
        assert.equal((await snapshot(db)).fluids.length, 2);
        await db.query('update public.drug_administrations set rank=2 where id=$1', [id]);
        await call(db, { id, text: '60 min', fluids: ['NSS'], min: 0 });
        const saved = await snapshot(db);
        assert.equal(saved.parents[0].instructions, '60 min');
        assert.equal(saved.parents[0].rank, 2);
        assert.equal(saved.parents[0].min_conc, 0);
        assert.equal(saved.parents[0].updated_by, 'editor@example.test');
        assert.deepEqual(saved.fluids.map(f => f.fluid_short_name), ['NSS']);
        await call(db, { id, fluids: [] });
        assert.equal((await snapshot(db)).fluids, null);
        await db.exec(migration); // Migration can be safely reapplied.
    } finally { await db.close(); }
});

test('fluid insertion failure rolls back parent, deleted fluids, and audit writes for edit and create', async () => {
    const db = await fixture();
    try {
        const id = await call(db, { text: '30 min', fluids: ['NSS','D5W'] });
        const before = await snapshot(db);
        await assert.rejects(call(db, { id, text: '60 min', fluids: ['NSS','UNKNOWN'] }), /foreign key/);
        assert.deepEqual(await snapshot(db), before);
        await assert.rejects(call(db, { drug: 'B', fluids: ['UNKNOWN'] }), /foreign key/);
        assert.deepEqual(await snapshot(db), before);
        await assert.rejects(call(db, { id, drug: 'B' }), /no longer exists|not writable/);
        await assert.rejects(call(db, { id: '999999' }), /no longer exists|not writable/);
        for (const fluids of [null, [''], [null]]) await assert.rejects(call(db, { id, fluids }), /explicit array/);
        for (const min of ['NaN','Infinity','-Infinity']) await assert.rejects(call(db, { id, min }), /finite/);
        assert.deepEqual(await snapshot(db), before);
    } finally { await db.close(); }
});

test('RPC denies anon, respects parent/child RLS and never silently accepts a filtered delete', async () => {
    const db = await fixture();
    try {
        const id = await call(db, { fluids: ['NSS','D5W'] });
        const before = await snapshot(db);
        await assert.rejects(call(db, { id }, 'anon'), /permission denied/);
        await db.exec('drop policy write_parent on public.drug_administrations');
        await assert.rejects(call(db, { id }), /no longer exists|not writable/);
        assert.deepEqual(await snapshot(db), before);
        await db.exec(`create policy write_parent on public.drug_administrations for all to authenticated using (true) with check (true);
            drop policy delete_fluids on public.administration_fluids;`);
        await assert.rejects(call(db, { id, fluids: [] }), /could not be replaced/);
        assert.deepEqual(await snapshot(db), before);
        await db.exec(`create policy delete_fluids on public.administration_fluids for delete to authenticated using (true);
            drop policy insert_fluids on public.administration_fluids;`);
        await assert.rejects(call(db, { id }), /row-level security/);
        assert.deepEqual(await snapshot(db), before);
        const f = (await db.query(`select prosecdef,proconfig from pg_proc where oid='public.save_administration_with_fluids(bigint,text,text,text,numeric,numeric,text,text[])'::regprocedure`)).rows[0];
        assert.equal(f.prosecdef, false);
        assert.ok(f.proconfig.some(v => v.startsWith('search_path=')));
    } finally { await db.close(); }
});
