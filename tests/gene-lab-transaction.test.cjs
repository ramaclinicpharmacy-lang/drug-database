const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const folder = path.join(__dirname, '..', 'supabase', 'migrations');
const migration = fs.readFileSync(path.join(folder, fs.readdirSync(folder).find(n => n.endsWith('_gene_lab_atomic_bulk.sql'))), 'utf8');
async function fixture() {
    const db = new PGlite();
    await db.exec(`
        create role anon; create role authenticated;
        grant usage on schema public to anon, authenticated;
        create table public.generics (generic_code text primary key);
        create table public.generic_gene_lab (
            id bigint generated always as identity primary key,
            generic_code text not null references public.generics on delete cascade,
            test_name text not null, description text, created_at timestamptz default now()
        );
        create table public.audit_logs (old_data jsonb,new_data jsonb);
        create function public.test_gene_audit() returns trigger language plpgsql security definer as $$
        begin
            insert into public.audit_logs values(to_jsonb(OLD),to_jsonb(NEW));
            if TG_OP='DELETE' then return OLD; else return NEW; end if;
        end $$;
        create trigger gene_audit after insert or update or delete on public.generic_gene_lab for each row execute function public.test_gene_audit();
        alter table public.generic_gene_lab enable row level security;
        create policy read_gene on public.generic_gene_lab for select using(true);
        create policy insert_gene on public.generic_gene_lab for insert to authenticated with check(true);
        create policy update_gene on public.generic_gene_lab for update to authenticated using(true) with check(true);
        create policy delete_gene on public.generic_gene_lab for delete to authenticated using(true);
        grant select,insert,update,delete on public.generic_gene_lab to authenticated;
        grant select on public.generic_gene_lab to anon;
        grant usage,select on all sequences in schema public to authenticated;
        insert into public.generics values('A'),('B'),('C');
        insert into public.generic_gene_lab(generic_code,test_name,description) values
            ('A','TEST','Advice A'),('B','TEST','Advice B'),('C','OTHER','Unrelated');
    `);
    await db.exec(migration);
    return db;
}
async function expected(db, name='TEST') {
    return (await db.query('select id,generic_code,description from public.generic_gene_lab where test_name=$1 order by id',[name])).rows;
}
async function snapshot(db) {
    return (await db.query(`select (select jsonb_agg(to_jsonb(g) order by id) from public.generic_gene_lab g) rows,
        (select count(*) from public.audit_logs) audits`)).rows[0];
}
async function save(db,{codes=['A','B'],description='New advice',replace=false,rows,name='TEST'}={},role='authenticated') {
    const loaded=rows === undefined ? await expected(db,name) : rows;
    await db.exec(`set role ${role}`);
    try {
        return (await db.query('select public.save_gene_lab_links($1,$2::text[],$3,$4,$5::jsonb) result',
            [name,codes,description,replace,JSON.stringify(loaded)])).rows[0].result;
    } finally { await db.exec('reset role'); }
}

test('bulk Gene/Lab preserves per-drug advice and IDs, adds/removes only changed links', async () => {
    const db=await fixture();
    try {
        const before=await snapshot(db);
        const unchanged=await save(db);
        assert.equal(unchanged.updated_count,0);
        assert.deepEqual(await snapshot(db),before);
        const result=await save(db,{codes:['A','C','C']});
        assert.deepEqual(result,{added_count:1,removed_count:1,updated_count:0,selected_count:2});
        const after=await snapshot(db);
        assert.deepEqual(after.rows.find(r=>r.test_name==='TEST'&&r.generic_code==='A'),before.rows[0]);
        assert.equal(after.rows.find(r=>r.test_name==='TEST'&&r.generic_code==='C').description,'New advice');
        assert.deepEqual(after.rows.find(r=>r.test_name==='OTHER'),before.rows[2]);
        await db.exec(migration);
        await save(db,{codes:[]});
        assert.deepEqual((await snapshot(db)).rows.map(r=>r.test_name),['OTHER']);
    } finally { await db.close(); }
});

test('bulk Gene/Lab explicitly replaces or clears existing descriptions without recreating rows', async () => {
    const db=await fixture();
    try {
        const before=(await snapshot(db)).rows;
        await save(db,{replace:true,description:'Shared advice'});
        let after=(await snapshot(db)).rows;
        assert.deepEqual(after.slice(0,2).map(r=>r.description),['Shared advice','Shared advice']);
        assert.deepEqual(after.map(r=>r.id),before.map(r=>r.id));
        await save(db,{replace:true,description:null});
        after=(await snapshot(db)).rows;
        assert.deepEqual(after.slice(0,2).map(r=>r.description),[null,null]);
        assert.equal(after[2].description,'Unrelated');
        // Legacy duplicate records remain intact in preserve mode.
        await db.query("insert into public.generic_gene_lab(generic_code,test_name,description) values('A','TEST','Second advice A')");
        const duplicated=await snapshot(db);
        await save(db);
        assert.deepEqual(await snapshot(db),duplicated);
    } finally { await db.close(); }
});

test('failed insert rolls back deselection, overwritten advice and audit writes as one transaction', async () => {
    const db=await fixture();
    try {
        const before=await snapshot(db);
        await assert.rejects(save(db,{codes:['A','MISSING'],replace:true}),/foreign key/);
        assert.deepEqual(await snapshot(db),before);
        for (const codes of [null,[''],[null]]) await assert.rejects(save(db,{codes}),/required|blank/);
        assert.deepEqual(await snapshot(db),before);
    } finally { await db.close(); }
});

test('stale Gene/Lab snapshots reject changed descriptions, additions and removals', async () => {
    const db=await fixture();
    try {
        for (const sql of [
            "update public.generic_gene_lab set description='Changed concurrently' where test_name='TEST' and generic_code='A'",
            "insert into public.generic_gene_lab(generic_code,test_name,description) values('C','TEST','Added concurrently')",
            "delete from public.generic_gene_lab where test_name='TEST' and generic_code='B'"
        ]) {
            const rows=await expected(db);
            await db.exec(sql);
            const changed=await snapshot(db);
            await assert.rejects(save(db,{codes:[],rows}),/changed since loading/);
            assert.deepEqual(await snapshot(db),changed);
        }
    } finally { await db.close(); }
});

test('Gene/Lab RPC denies anonymous callers and detects RLS-filtered deletes/updates', async () => {
    const db=await fixture();
    try {
        const before=await snapshot(db);
        await assert.rejects(save(db,{},'anon'),/permission denied/);
        await db.exec('drop policy delete_gene on public.generic_gene_lab');
        await assert.rejects(save(db,{codes:['A']}),/could not be fully saved/);
        assert.deepEqual(await snapshot(db),before);
        await db.exec(`create policy delete_gene on public.generic_gene_lab for delete to authenticated using(true);
            drop policy update_gene on public.generic_gene_lab;`);
        await assert.rejects(save(db,{replace:true}),/could not all be updated/);
        assert.deepEqual(await snapshot(db),before);
        await db.exec('drop policy insert_gene on public.generic_gene_lab');
        await assert.rejects(save(db,{codes:['A','C']}),/row-level security/);
        assert.deepEqual(await snapshot(db),before);
        const fn=(await db.query("select prosecdef,proconfig from pg_proc where oid='public.save_gene_lab_links(text,text[],text,boolean,jsonb)'::regprocedure")).rows[0];
        assert.equal(fn.prosecdef,false);
        assert.ok(fn.proconfig.includes('search_path=""'));
    } finally { await db.close(); }
});
