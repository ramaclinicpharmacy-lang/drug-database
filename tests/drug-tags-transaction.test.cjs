const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const folder = path.join(__dirname, '..', 'supabase', 'migrations');
const migration = fs.readFileSync(path.join(folder, fs.readdirSync(folder).find(n => n.endsWith('_drug_tags_atomic_save.sql'))), 'utf8');
async function fixture() {
    const db=new PGlite();
    await db.exec(`
        create role anon; create role authenticated;
        create schema auth;
        create function auth.jwt() returns jsonb language sql stable as $$select '{"email":"editor@example.test"}'::jsonb$$;
        grant usage on schema public,auth to anon,authenticated;
        create table public.dosage_forms(form_name text primary key);
        create table public.drugs(
            drug_code text primary key,drug_name text not null,
            dosage_form text references public.dosage_forms,special_note text,statuscode text,remarks text,
            is_active boolean default true,trade_name text,drug_type text default 'drug',strength text,
            is_high_error_risk boolean default false,image_url_1 text,image_url_2 text,
            updated_at timestamptz default now(),updated_by text
        );
        create table public.drug_tags(tag_name text primary key);
        create table public.drug_tag_mapping(
            drug_code text references public.drugs on delete cascade,
            tag_name text references public.drug_tags,
            primary key(drug_code,tag_name)
        );
        create table public.audit_logs(table_name text,old_data jsonb,new_data jsonb);
        create function public.test_drug_audit() returns trigger language plpgsql security definer as $$
        begin
            insert into audit_logs values(TG_TABLE_NAME,to_jsonb(OLD),to_jsonb(NEW));
            if TG_OP='DELETE' then return OLD; else return NEW; end if;
        end $$;
        create trigger audit_drug after insert or update or delete on public.drugs for each row execute function public.test_drug_audit();
        create trigger audit_tag after insert or update or delete on public.drug_tag_mapping for each row execute function public.test_drug_audit();
        alter table public.drugs enable row level security;
        alter table public.drug_tag_mapping enable row level security;
        create policy read_drug on public.drugs for select using(true);
        create policy insert_drug on public.drugs for insert to authenticated with check(true);
        create policy update_drug on public.drugs for update to authenticated using(true) with check(true);
        create policy read_tag on public.drug_tag_mapping for select using(true);
        create policy insert_tag on public.drug_tag_mapping for insert to authenticated with check(true);
        create policy delete_tag on public.drug_tag_mapping for delete to authenticated using(true);
        grant select,insert,update on public.drugs to authenticated;
        grant select,insert,update,delete on public.drug_tag_mapping to authenticated;
        grant select on public.drugs,public.drug_tag_mapping to anon;
        insert into public.dosage_forms values('Tablet');
        insert into public.drug_tags values('A'),('B'),('C');
        insert into public.drugs(drug_code,drug_name,is_active,image_url_1,image_url_2) values('OLD','Original',false,'image1','image2');
        insert into public.drug_tag_mapping values('OLD','A'),('OLD','B');
    `);
    await db.exec(migration);
    return db;
}
async function snapshot(db) {
    return (await db.query(`select
        (select jsonb_agg(to_jsonb(d) order by drug_code) from public.drugs d) drugs,
        (select jsonb_agg(to_jsonb(t) order by drug_code,tag_name) from public.drug_tag_mapping t) tags,
        (select count(*) from public.audit_logs) audits`)).rows[0];
}
async function save(db,{code='OLD',edit=true,tags=['A','C'],name='Edited',form='Tablet'}={},role='authenticated') {
    await db.exec(`set role ${role}`);
    try {
        return (await db.query(`select public.save_drug_with_tags($1,$2,$3,'drug','Trade','500 mg',$4,'Note','online','Remarks',true,$5::text[]) code`,
            [code,edit,name,form,tags])).rows[0].code;
    } finally { await db.exec('reset role'); }
}

test('drug and tag save creates or updates a complete set without changing non-editable fields',async()=>{
    const db=await fixture();
    try {
        assert.equal(await save(db,{tags:['A','C','C']}),'OLD');
        let state=await snapshot(db);
        assert.equal(state.drugs[0].drug_name,'Edited');
        assert.equal(state.drugs[0].is_active,false);
        assert.equal(state.drugs[0].image_url_1,'image1');
        assert.equal(state.drugs[0].image_url_2,'image2');
        assert.equal(state.drugs[0].is_high_error_risk,true);
        assert.deepEqual(state.tags.map(t=>t.tag_name),['A','C']);
        await save(db,{tags:[]});
        assert.equal((await snapshot(db)).tags,null);
        await save(db,{code:'NEW',edit:false,tags:['B']});
        state=await snapshot(db);
        const added=state.drugs.find(d=>d.drug_code==='NEW');
        assert.equal(added.is_active,true);
        assert.equal(added.updated_by,'editor@example.test');
        assert.deepEqual(state.tags,[{drug_code:'NEW',tag_name:'B'}]);
        await db.exec(migration);
    } finally { await db.close(); }
});

test('invalid tags roll back drug fields, removed tags, new drugs and audit rows together',async()=>{
    const db=await fixture();
    try {
        const before=await snapshot(db);
        await assert.rejects(save(db,{tags:['A','MISSING']}),/foreign key/);
        assert.deepEqual(await snapshot(db),before);
        await assert.rejects(save(db,{code:'NEW',edit:false,tags:['MISSING']}),/foreign key/);
        assert.deepEqual(await snapshot(db),before);
        await assert.rejects(save(db,{form:'UNKNOWN'}),/foreign key/);
        for(const tags of [null,[''],[null]])await assert.rejects(save(db,{tags}),/required|blank/);
        assert.deepEqual(await snapshot(db),before);
    } finally { await db.close(); }
});

test('create never overwrites an existing drug and missing edits never recreate a drug',async()=>{
    const db=await fixture();
    try {
        const before=await snapshot(db);
        await assert.rejects(save(db,{edit:false}),/duplicate key/);
        await assert.rejects(save(db,{code:'REMOVED'}),/no longer exists|not writable/);
        assert.deepEqual(await snapshot(db),before);
    } finally { await db.close(); }
});

test('drug-tag RPC respects RLS, detects filtered deletes and denies anonymous execution',async()=>{
    const db=await fixture();
    try {
        const before=await snapshot(db);
        await assert.rejects(save(db,{},'anon'),/permission denied/);
        await db.exec('drop policy update_drug on public.drugs');
        await assert.rejects(save(db),/no longer exists|not writable/);
        assert.deepEqual(await snapshot(db),before);
        await db.exec(`create policy update_drug on public.drugs for update to authenticated using(true) with check(true);
            drop policy delete_tag on public.drug_tag_mapping;`);
        await assert.rejects(save(db,{tags:[]}),/could not be fully saved/);
        assert.deepEqual(await snapshot(db),before);
        await db.exec(`create policy delete_tag on public.drug_tag_mapping for delete to authenticated using(true);
            drop policy insert_tag on public.drug_tag_mapping;`);
        await assert.rejects(save(db),/row-level security/);
        assert.deepEqual(await snapshot(db),before);
        const fn=(await db.query("select prosecdef,proconfig from pg_proc where oid='public.save_drug_with_tags(text,boolean,text,text,text,text,text,text,text,text,boolean,text[])'::regprocedure")).rows[0];
        assert.equal(fn.prosecdef,false);
        assert.ok(fn.proconfig.some(c=>c.startsWith('search_path=')));
    } finally { await db.close(); }
});
