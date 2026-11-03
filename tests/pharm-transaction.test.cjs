const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const folder=path.join(__dirname,'..','supabase','migrations');
function migration(){const file=fs.readdirSync(folder).find(n=>n.endsWith('_pharm_atomic_saves.sql'));return fs.readFileSync(path.join(folder,file),'utf8');}
async function fixture(){
 const db=new PGlite();await db.exec(`
 create role anon;create role authenticated;
 grant usage on schema public to anon,authenticated;
 create table public.generics(generic_code text primary key,generic_name text not null,special_note text,generic_type text default 'drug',needs_renal_adj boolean default false,needs_hepatic_adj boolean default false);
 create table public.pharm_classes(class_name text primary key);
 create table public.generic_pharm_mapping(generic_code text references public.generics on delete cascade,class_name text references public.pharm_classes on delete cascade,primary key(generic_code,class_name));
 create table public.audit_logs(table_name text,old_data jsonb,new_data jsonb);
 create function public.test_pharm_audit() returns trigger language plpgsql security definer as $$begin
 insert into audit_logs values(TG_TABLE_NAME,to_jsonb(OLD),to_jsonb(NEW));
 if TG_OP='DELETE' then return OLD; else return NEW;end if;end$$;
 create trigger audit_gen after insert or update or delete on public.generics for each row execute function public.test_pharm_audit();
 create trigger audit_map after insert or update or delete on public.generic_pharm_mapping for each row execute function public.test_pharm_audit();
 alter table public.generics enable row level security;
 alter table public.generic_pharm_mapping enable row level security;
 create policy read_generics on public.generics for select using(true);
 create policy insert_generics on public.generics for insert to authenticated with check(true);
 create policy update_generics on public.generics for update to authenticated using(true) with check(true);
 create policy read_map on public.generic_pharm_mapping for select using(true);
 create policy insert_map on public.generic_pharm_mapping for insert to authenticated with check(true);
 create policy delete_map on public.generic_pharm_mapping for delete to authenticated using(true);
 grant select,insert,update on public.generics to authenticated;
 grant select,insert,update,delete on public.generic_pharm_mapping to authenticated;
 grant select on public.pharm_classes to authenticated,anon;
 grant select on public.generics,public.generic_pharm_mapping to anon;
 insert into public.generics(generic_code,generic_name)values('A','Generic A'),('B','Generic B'),('C','Generic C');
 insert into public.pharm_classes values('C1'),('C2'),('C3');
 insert into public.generic_pharm_mapping values('A','C1'),('A','C2'),('B','C1'),('C','C3');`);
 await db.exec(migration());return db;
}
async function role(db,run,who='authenticated'){await db.exec(`set role ${who}`);try{return await run();}finally{await db.exec('reset role');}}
async function snapshot(db){return(await db.query(`select
 (select jsonb_agg(to_jsonb(g) order by generic_code)from public.generics g) generics,
 (select jsonb_agg(to_jsonb(m) order by generic_code,class_name)from public.generic_pharm_mapping m) links,
 (select count(*)from public.audit_logs) audits`)).rows[0];}
async function generic(db,{code='A',edit=true,classes=['C2','C3'],expected=['C1','C2']}={},who){return role(db,async()=>
 (await db.query(`select public.save_generic_with_pharm($1,$2,'Edited generic','Note','drug',true,true,$3::text[],$4::text[]) result`,[code,edit,classes,expected])).rows[0].result,who);}
async function bulk(db,{name='C1',codes=['A','C'],expected=['A','B']}={},who){return role(db,async()=>
 (await db.query(`select public.save_pharm_class_links($1,$2::text[],$3::text[]) result`,[name,codes,expected])).rows[0].result,who);}

test('generic parent and class links save together, including create/clear and repeatable migration',async()=>{
 const db=await fixture();try{
 assert.equal(await generic(db),'A');let state=await snapshot(db);
 assert.equal(state.generics[0].generic_name,'Edited generic');
 assert.equal(state.generics[0].needs_renal_adj,true);assert.equal(state.generics[0].needs_hepatic_adj,true);
 assert.deepEqual(state.links.filter(x=>x.generic_code==='A').map(x=>x.class_name),['C2','C3']);
 assert.ok(state.links.some(x=>x.generic_code==='B'&&x.class_name==='C1'));
 await generic(db,{classes:[],expected:['C2','C3']});
 assert.equal((await snapshot(db)).links.filter(x=>x.generic_code==='A').length,0);
 await generic(db,{code:'NEW',edit:false,classes:['C1','C1'],expected:[]});
 assert.deepEqual((await snapshot(db)).links.filter(x=>x.generic_code==='NEW'),[{generic_code:'NEW',class_name:'C1'}]);
 await db.exec(migration());
 }finally{await db.close();}
});

test('generic class-insert failures roll back parent fields, deleted links and audit rows',async()=>{
 const db=await fixture();try{
 const before=await snapshot(db);
 await assert.rejects(generic(db,{classes:['C2','MISSING']}),/foreign key/);
 assert.deepEqual(await snapshot(db),before);
 await assert.rejects(generic(db,{code:'NEW',edit:false,classes:['MISSING'],expected:[]}),/foreign key/);
 assert.deepEqual(await snapshot(db),before);
 await assert.rejects(generic(db,{edit:false,expected:[]}),/already exists|duplicate key/);
 await assert.rejects(generic(db,{code:'REMOVED',expected:[]}),/no longer exists|not writable/);
 assert.deepEqual(await snapshot(db),before);
 }finally{await db.close();}
});

test('bulk membership reconciles only the selected class, supports clearing and rolls back on invalid generics',async()=>{
 const db=await fixture();try{
 const before=await snapshot(db);
 await assert.rejects(bulk(db,{codes:['A','MISSING']}),/foreign key/);
 assert.deepEqual(await snapshot(db),before);
 assert.equal(await bulk(db,{codes:['A','C','C']}),2);
 let state=await snapshot(db);
 assert.deepEqual(state.links.filter(x=>x.class_name==='C1').map(x=>x.generic_code),['A','C']);
 assert.ok(state.links.some(x=>x.generic_code==='A'&&x.class_name==='C2'));
 assert.ok(state.links.some(x=>x.generic_code==='C'&&x.class_name==='C3'));
 assert.equal(await bulk(db,{codes:[],expected:['A','C']}),0);
 assert.equal((await snapshot(db)).links.filter(x=>x.class_name==='C1').length,0);
 }finally{await db.close();}
});

test('changes through either save path invalidate stale snapshots used by the other path',async()=>{
 const db=await fixture();try{
 await generic(db);let changed=await snapshot(db);
 await assert.rejects(bulk(db),/changed since loading/);
 assert.deepEqual(await snapshot(db),changed);
 await bulk(db,{codes:['A','B'],expected:['B']});changed=await snapshot(db);
 await assert.rejects(generic(db,{expected:['C2','C3']}),/changed since loading/);
 assert.deepEqual(await snapshot(db),changed);
 }finally{await db.close();}
});

test('both RPCs deny anon and fail safely on filtered RLS writes or malformed selections',async()=>{
 const db=await fixture();try{
 const before=await snapshot(db);
 await assert.rejects(generic(db,{},'anon'),/permission denied/);
 await assert.rejects(bulk(db,{},'anon'),/permission denied/);
 for(const classes of [null,[''],[null]])await assert.rejects(generic(db,{classes}),/required|blank/);
 for(const codes of [null,[''],[null]])await assert.rejects(bulk(db,{codes}),/required|blank/);
 await db.exec('drop policy delete_map on public.generic_pharm_mapping');
 await assert.rejects(generic(db,{classes:[]}),/could not be fully saved/);
 await assert.rejects(bulk(db,{codes:[]}),/could not be fully saved/);
 assert.deepEqual(await snapshot(db),before);
 await db.exec(`create policy delete_map on public.generic_pharm_mapping for delete to authenticated using(true);drop policy insert_map on public.generic_pharm_mapping;`);
 await assert.rejects(generic(db),/row-level security/);await assert.rejects(bulk(db),/row-level security/);
 assert.deepEqual(await snapshot(db),before);
 const funcs=(await db.query("select prosecdef,proconfig from pg_proc where proname in('save_generic_with_pharm','save_pharm_class_links')")).rows;
 assert.equal(funcs.length,2);assert.ok(funcs.every(f=>!f.prosecdef&&f.proconfig.some(x=>x.startsWith('search_path='))));
 }finally{await db.close();}
});
