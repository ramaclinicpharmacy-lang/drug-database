const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
function migration() {
    const folder = path.join(__dirname, '..', 'supabase');
    const pending = path.join(folder, 'iv_drug_display_order.pending.sql');
    if (fs.existsSync(pending)) return fs.readFileSync(pending, 'utf8');
    const file = fs.readdirSync(path.join(folder, 'migrations')).find(name => name.endsWith('_iv_drug_display_order.sql'));
    return fs.readFileSync(path.join(folder, 'migrations', file), 'utf8');
}
test('IV order migration preserves all names, aliases and relationships and prioritizes Succinate', async () => {
    const db = new PGlite();
    try {
        await db.exec(`create role anon; create role authenticated;
            create table public.drug_for_iv_compat(drug_name text primary key, aliases text, created_at timestamptz default now());
            create table public.iv_compatibility(id bigint primary key, drug_a text references public.drug_for_iv_compat, drug_b text references public.drug_for_iv_compat, y_site_result text);
            insert into public.drug_for_iv_compat(drug_name,aliases) values ('Hydrocortisone Sodium Phosphate',null),('Hydrocortisone Sodium Succinate','hydrocortisone'),('Other','Alias');
            insert into public.iv_compatibility values (1,'Hydrocortisone Sodium Succinate','Other','C');
            alter table public.drug_for_iv_compat enable row level security;
            grant select on public.drug_for_iv_compat to anon;
            grant select,insert,update,delete on public.drug_for_iv_compat to authenticated;
            create policy public_read on public.drug_for_iv_compat for select using(true);
            create policy editors on public.drug_for_iv_compat for all to authenticated using(true) with check(true);`);
        const before = (await db.query('select drug_name,aliases,created_at from public.drug_for_iv_compat order by drug_name')).rows;
        await db.exec(migration());
        assert.deepEqual((await db.query('select drug_name,aliases,created_at from public.drug_for_iv_compat order by drug_name')).rows, before);
        assert.equal((await db.query('select drug_name from public.drug_for_iv_compat order by display_order,drug_name limit 1')).rows[0].drug_name, 'Hydrocortisone Sodium Succinate');
        assert.equal((await db.query('select y_site_result from public.iv_compatibility')).rows[0].y_site_result, 'C');
        await assert.rejects(db.exec("update public.drug_for_iv_compat set display_order=-1 where drug_name='Other'"));
        await db.exec('set role anon');
        await assert.rejects(db.exec("update public.drug_for_iv_compat set display_order=1 where drug_name='Other'"));
        await db.exec('reset role; set role authenticated');
        await db.exec("update public.drug_for_iv_compat set display_order=0 where drug_name='Other'; insert into public.drug_for_iv_compat(drug_name) values ('New');");
        assert.equal((await db.query("select display_order from public.drug_for_iv_compat where drug_name='New'")).rows[0].display_order, 1000);
    } finally { await db.close(); }
});
