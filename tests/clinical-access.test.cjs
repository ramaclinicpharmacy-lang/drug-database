const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
// Synthetic fixtures: no production schema/policy snapshot is published.
const tables = [
    'drug_label_mapping','drug_links','drug_nlem_mapping','drug_tags',
    'generic_adjustments','generic_links','generic_pharm_mapping','labels',
    'med_error_knowledge','nlem_categories','nutrition_configs','pharm_classes'
];
const schema = {
    tables,
    columns: tables.flatMap(table => [
        {table_name:table,column_name:table==='drug_tags'?'tag_name':'fixture_key',udt_name:'text',is_nullable:'NO',is_identity:'NO'},
        {table_name:table,column_name:'fixture_value',udt_name:'text',is_nullable:'YES',is_identity:'NO'}
    ]),
    policies: tables.flatMap((table,index) => {
        const policy=(name,cmd,roles,qual,with_check)=>({tablename:table,policyname:name,cmd,roles,qual,with_check});
        const reads=[policy('fixture_public_read','SELECT',['public'],'true',null)];
        const writes=index%2===0
            ? [policy('fixture_public_all','ALL',['public'],'true',null)]
            : [policy('fixture_public_insert','INSERT',['public'],null,'true'),
               policy('fixture_public_update','UPDATE',['public'],'true','true'),
               policy('fixture_public_delete','DELETE',['public'],'true',null)];
        const existingAuth=index%3===0?[policy('fixture_auth_all','ALL',['authenticated'],'true',null)]:[];
        return [...reads,...writes,...existingAuth];
    })
};
const folder = path.join(__dirname,'..','supabase','migrations');
function migration() {
    const file=fs.readdirSync(folder).find(n=>n.endsWith('_clinical_tables_readonly_anon.sql'));
    return fs.readFileSync(path.join(folder,file),'utf8');
}
const ident=value=>'"'+value.replaceAll('"','""')+'"';
function tableColumns(table) { return schema.columns.filter(c=>c.table_name===table); }
function input(table,seed) {
    const columns=tableColumns(table).filter(c=>c.is_identity!=='YES');
    const values=columns.map(c=>c.udt_name==='text'?seed:c.udt_name==='timestamptz'?'2026-11-03T00:00:00Z':1);
    return {columns,values};
}
async function insert(db,table,seed) {
    const {columns,values}=input(table,seed);
    return db.query(`insert into public.${ident(table)} (${columns.map(c=>ident(c.column_name)).join(',')}) values (${values.map((_,i)=>'$'+(i+1)).join(',')}) returning *`,values);
}
async function asRole(db,role,run) {
    await db.exec(`set role ${role}`);
    try { return await run(); } finally { await db.exec('reset role'); }
}
async function snapshot(db) {
    const result={};
    for(const table of schema.tables) result[table]=(await db.query(`select * from public.${ident(table)} order by 1`)).rows;
    return result;
}
async function fixture() {
    const db=new PGlite();
    await db.exec('create role anon; create role authenticated; grant usage on schema public to anon,authenticated;');
    const types=new Set(['text','int8','int2','numeric','timestamptz']);
    for(const table of schema.tables) {
        const cols=tableColumns(table);
        assert.ok(cols.length>0);
        const definitions=cols.map(c=>{
            assert.ok(types.has(c.udt_name));
            return `${ident(c.column_name)} ${c.udt_name} ${c.is_identity==='YES'?'generated always as identity':''} ${c.is_nullable==='NO'?'not null':''}`;
        });
        await db.exec(`create table public.${ident(table)} (${definitions.join(',')});
            alter table public.${ident(table)} enable row level security;
            grant all on public.${ident(table)} to anon,authenticated;
            grant insert,update,delete on public.${ident(table)} to public;
            grant insert (${cols.map(c=>ident(c.column_name)).join(',')}),update (${cols.map(c=>ident(c.column_name)).join(',')}) on public.${ident(table)} to anon;`);
        for(const policy of schema.policies.filter(p=>p.tablename===table)) {
            assert.ok(['ALL','SELECT','INSERT','UPDATE','DELETE'].includes(policy.cmd));
            assert.ok(policy.roles.every(r=>['public','anon','authenticated'].includes(r)));
            assert.ok([null,'true'].includes(policy.qual));
            assert.ok([null,'true'].includes(policy.with_check));
            await db.exec(`create policy ${ident(policy.policyname)} on public.${ident(table)} for ${policy.cmd} to ${policy.roles.map(ident).join(',')}
                ${policy.qual?'using(true)':''} ${policy.with_check?'with check(true)':''}`);
        }
        await insert(db,table,'seed');
    }
    await db.exec(`grant usage,select on all sequences in schema public to authenticated;
        create table public.iv_search_logs(message text);
        alter table public.iv_search_logs enable row level security;
        grant insert on public.iv_search_logs to anon;
        create policy log_insert on public.iv_search_logs for insert to public with check(true);
        alter table public.drug_tags add primary key(tag_name);
        create table public.protected_tag_links(tag_name text references public.drug_tags(tag_name) on update cascade on delete cascade);
        insert into public.protected_tag_links values('seed');`);
    return db;
}

test('all 12 clinical tables reject unsigned writes, retain public rows and allow authenticated CRUD',async t=>{
    const db=await fixture();
    try {
        const before=await snapshot(db);
        await db.exec(migration());
        assert.deepEqual(await snapshot(db),before);
        for(const table of schema.tables) await t.test(table,async()=>{
            const column=tableColumns(table).find(c=>c.udt_name==='text').column_name;
            const q=`public.${ident(table)}`;
            assert.deepEqual((await asRole(db,'anon',()=>db.query(`select * from ${q}`))).rows,before[table]);
            await assert.rejects(asRole(db,'anon',()=>insert(db,table,'unsigned')),e=>e.code==='42501');
            await assert.rejects(asRole(db,'anon',()=>db.query(`update ${q} set ${ident(column)}='unsigned'`)),e=>e.code==='42501');
            await assert.rejects(asRole(db,'anon',()=>db.query(`delete from ${q}`)),e=>e.code==='42501');
            await assert.rejects(asRole(db,'anon',()=>db.query(`truncate ${q}`)),e=>e.code==='42501');
            assert.equal((await asRole(db,'authenticated',()=>db.query(`select * from ${q}`))).rows.length,1);
            await asRole(db,'authenticated',()=>insert(db,table,'added'));
            const updated=await asRole(db,'authenticated',()=>db.query(`update ${q} set ${ident(column)}=$1 where ${ident(column)}=$2 returning *`,['edited','added']));
            assert.equal(updated.rows.length,1);
            const deleted=await asRole(db,'authenticated',()=>db.query(`delete from ${q} where ${ident(column)}=$1 returning *`,['edited']));
            assert.equal(deleted.rows.length,1);
            const acl=(await db.query(`select has_table_privilege('anon',$1,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') writable,
                has_any_column_privilege('anon',$1,'INSERT,UPDATE,REFERENCES') column_writable`,[`public.${table}`])).rows[0];
            assert.deepEqual(acl,{writable:false,column_writable:false});
        });
        assert.deepEqual(await snapshot(db),before);
        await db.exec(migration());
        assert.deepEqual(await snapshot(db),before);
        assert.equal((await db.query(`select count(*)::int count from pg_policies where schemaname='public' and tablename=any($1::text[]) and cmd<>'SELECT'
            and (roles @> array['public']::name[] or roles @> array['anon']::name[])`,[schema.tables])).rows[0].count,0);
    } finally { await db.close(); }
});

test('blocking master-tag deletion also protects linked data from cascading unsigned deletes',async()=>{
    const db=await fixture();
    try {
        // Reproduce the cascade in an isolated rollback-only transaction.
        await db.exec('begin; set local role anon;');
        await db.query("delete from public.drug_tags where tag_name='seed'");
        await db.exec('reset role;');
        assert.equal((await db.query('select count(*)::int count from public.protected_tag_links')).rows[0].count,0);
        await db.exec('rollback;');
        await db.exec(migration());
        await assert.rejects(asRole(db,'anon',()=>db.query("delete from public.drug_tags where tag_name='seed'")),e=>e.code==='42501');
        assert.equal((await db.query('select count(*)::int count from public.protected_tag_links')).rows[0].count,1);
        await asRole(db,'anon',()=>db.query("insert into public.iv_search_logs values('intended public log')"));
        assert.equal((await db.query('select count(*)::int count from public.iv_search_logs')).rows[0].count,1);
    } finally { await db.close(); }
});
