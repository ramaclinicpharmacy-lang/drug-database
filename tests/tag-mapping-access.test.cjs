const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const folder = path.join(__dirname,'..','supabase','migrations');
function readMigration(suffix) { return fs.readFileSync(path.join(folder,fs.readdirSync(folder).find(n=>n.endsWith(suffix))),'utf8'); }
async function fixture() {
    const db=new PGlite();
    await db.exec(`
        create role anon; create role authenticated;
        create schema auth;
        create function auth.jwt() returns jsonb language sql stable as $$select '{"email":"editor@example.test"}'::jsonb$$;
        grant usage on schema public,auth to anon,authenticated;
        create table public.drugs(drug_code text primary key,drug_name text not null,drug_type text,
            trade_name text,strength text,dosage_form text,special_note text,statuscode text,remarks text,
            is_high_error_risk boolean,updated_by text);
        create table public.drug_tags(tag_name text primary key);
        create table public.drug_tag_mapping(drug_code text references public.drugs,tag_name text references public.drug_tags,primary key(drug_code,tag_name));
        alter table public.drugs enable row level security;
        alter table public.drug_tag_mapping enable row level security;
        create policy public_read_drugs on public.drugs for select using(true);
        create policy auth_drugs on public.drugs for all to authenticated using(true) with check(true);
        create policy "Allow All Tag Map" on public.drug_tag_mapping for all to public using(true);
        create policy "Admin CRUD Tag Map" on public.drug_tag_mapping for all to authenticated using(true);
        create policy "Admin CRUD Tags Map" on public.drug_tag_mapping for all to authenticated using(true);
        create policy "Public Read Tag Map" on public.drug_tag_mapping for select to public using(true);
        create policy "Public Read Tags Map" on public.drug_tag_mapping for select to public using(true);
        grant select,insert,update on public.drugs to authenticated;
        grant all on public.drug_tag_mapping to anon,authenticated;
        -- Explicit column grants must be removed too, not just table grants.
        grant insert(drug_code,tag_name),update(drug_code,tag_name),references(drug_code,tag_name) on public.drug_tag_mapping to anon;
        insert into public.drugs(drug_code,drug_name) values('D','Original');
        insert into public.drug_tags values('A'),('B');
        insert into public.drug_tag_mapping values('D','A');
    `);
    await db.exec(readMigration('_drug_tags_atomic_save.sql'));
    return db;
}
async function asRole(db,role,sql,params=[]) {
    await db.exec(`set role ${role}`);
    try { return await db.query(sql,params); } finally { await db.exec('reset role'); }
}
async function rows(db) { return (await db.query('select * from public.drug_tag_mapping order by drug_code,tag_name')).rows; }

test('access migration closes reproduced anonymous writes while preserving public reads and all existing rows',async()=>{
    const db=await fixture();
    try {
        // Demonstrate the original flaw in an isolated test database only.
        await asRole(db,'anon',"insert into public.drug_tag_mapping values('D','B')");
        await asRole(db,'anon',"delete from public.drug_tag_mapping where tag_name='B'");
        const before=await rows(db);
        const migration=readMigration('_tag_mapping_readonly_anon.sql');
        await db.exec(migration);
        assert.deepEqual(await rows(db),before);
        assert.deepEqual((await asRole(db,'anon','select * from public.drug_tag_mapping')).rows,before);
        for(const sql of [
            "insert into public.drug_tag_mapping values('D','B')",
            "update public.drug_tag_mapping set tag_name='B' where drug_code='D'",
            "delete from public.drug_tag_mapping where drug_code='D'",
            'truncate public.drug_tag_mapping'
        ]) await assert.rejects(asRole(db,'anon',sql),e=>e.code==='42501');
        assert.deepEqual(await rows(db),before);
        const acl=(await db.query(`select
            has_table_privilege('anon','public.drug_tag_mapping','SELECT') readable,
            has_table_privilege('anon','public.drug_tag_mapping','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') writable,
            has_any_column_privilege('anon','public.drug_tag_mapping','INSERT,UPDATE,REFERENCES') column_writable`)).rows[0];
        assert.deepEqual(acl,{readable:true,writable:false,column_writable:false});
        await db.exec(migration);
        assert.deepEqual(await rows(db),before);
    } finally { await db.close(); }
});

test('authenticated direct CRUD and the deployed atomic drug-save RPC remain functional',async()=>{
    const db=await fixture();
    try {
        await db.exec(readMigration('_tag_mapping_readonly_anon.sql'));
        assert.equal((await asRole(db,'authenticated','select * from public.drug_tag_mapping')).rows.length,1);
        await asRole(db,'authenticated',"insert into public.drug_tag_mapping values('D','B')");
        await asRole(db,'authenticated',"delete from public.drug_tag_mapping where tag_name='A'");
        await asRole(db,'authenticated',"update public.drug_tag_mapping set tag_name='A' where tag_name='B'");
        assert.deepEqual(await rows(db),[{drug_code:'D',tag_name:'A'}]);
        const result=await asRole(db,'authenticated',`select public.save_drug_with_tags('D',true,'Edited','drug',null,null,null,null,null,null,false,array['B']) code`);
        assert.equal(result.rows[0].code,'D');
        assert.deepEqual(await rows(db),[{drug_code:'D',tag_name:'B'}]);
        assert.equal((await db.query("select drug_name from public.drugs where drug_code='D'")).rows[0].drug_name,'Edited');
    } finally { await db.close(); }
});

test('public inherited write grants cannot reopen the table for unsigned callers',async()=>{
    const db=await fixture();
    try {
        await db.exec('grant insert,update,delete on public.drug_tag_mapping to public');
        await db.exec(readMigration('_tag_mapping_readonly_anon.sql'));
        await assert.rejects(asRole(db,'anon',"delete from public.drug_tag_mapping"),e=>e.code==='42501');
        assert.equal((await asRole(db,'anon','select * from public.drug_tag_mapping')).rows.length,1);
        assert.equal((await db.query("select has_table_privilege('authenticated','public.drug_tag_mapping','INSERT') allowed")).rows[0].allowed,true);
    } finally { await db.close(); }
});
