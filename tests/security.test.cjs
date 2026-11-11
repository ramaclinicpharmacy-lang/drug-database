// Run: npm install && npx playwright install chromium && npm test
// Every network request is intercepted. No production database is contacted.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const attack = `<img src=x onerror="window.__xss=1"><svg onload="window.__xss=1"></svg>`;
const text = `O'Brien "ไทย" & <30 ≥60 \\ path\n${attack}`;
const code = `D'"&<>\\[]`;
let browser;
before(async () => {
    browser = await chromium.launch({
        headless: true,
        ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    });
});
after(async () => { await browser?.close(); });

async function openPage(file, run, fixtureOptions = {}) {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.dismiss());
    await page.addInitScript(({ text, code, fixtureOptions }) => {
        const generic = { generic_code: 'G1', generic_name: text, generic_type: 'drug', special_note: text,
            needs_renal_adj: true, needs_hepatic_adj: true,
            generic_gene_lab: [{ test_name: text, description: text }],
            generic_pharm_mapping: [{ class_name: text }],
            generic_links: [{ id: 1, link_title: text, url: 'javascript:window.__xss=1' }] };
        const drug = { drug_code: code, drug_name: text, trade_name: text, strength: text, dosage_form: text,
            drug_type: 'enteral nutrition', is_active: true, special_note: text, remarks: text, statuscode: 'online',
            image_url_1: 'javascript:window.__xss=1', drug_nickname: [{ nickname: text }],
            drug_contents: [{ amount: 1, unit: text, generics: generic }],
            drug_tag_mapping: [{ tag_name: text }], drug_label_mapping: [{ label_code: text, labels: { label_name: text } }],
            drug_nlem_mapping: [{ nlem_code: text, condition_note: text }],
            drug_administrations: [{ id: 1, rank: 1, min_conc: 1, max_conc: 2, conc_unit: text, instructions: text,
                updated_at: '2026-10-28T00:00:00Z', updated_by: text,
                routes: { route_code: text, route_name: text }, administration_fluids: [{ fluid_short_name: text }] }],
            nutrition_configs: { product_type: 'powder', serving_volume_ml: 250, serving_kcal: 250, grams_per_scoop: 5,
                scoops_per_serving: 5, preparation_note: text },
            med_error_knowledge: [{ id: 1, error_type: text, error_description: text, prevention_tip: text }],
            drug_links: [{ id: 1, link_title: text, url: 'javascript:window.__xss=1' }] };
        window.__fixtures = {
            drugs: [drug], generics: [generic], pharm_classes: [{ class_name: text }],
            routes: [{ route_code: text, route_name: text, rank: 1 }], fluids: [{ short_name: text, full_name: text }],
            dosage_forms: [{ form_name: text }], drug_tags: [{ tag_name: text }],
            nlem_categories: [{ category_code: text, description: text }], labels: [{ label_code: text, label_name: text }],
            generic_adjustments: [{ generic_code: 'G1', adj_type: 'renal', criterion_type: 'CrCl', min_value: 0, max_value: 60, recommendation: text, note: text }],
            generic_gene_lab: [{ id: 1, generic_code: 'G1', test_name: text, description: text }],
            drug_for_iv_compat: [{ drug_name: text, aliases: text }, { drug_name: 'B', aliases: '' }],
            iv_compatibility: [{ id: 1, drug_a: text, drug_b: 'B', y_site_result: 'C', admixture_result: 'U', detail: text, reference: text, search_date: '2026-10-28' }],
            enteral_nutrients: [{ drug_code: code, macros: { [text]: '<0.01' }, vitamins: {}, minerals: {}, specials: {} }],
            audit_logs: [{ action: 'UPDATE', changed_at: '2026-10-28', changed_by: text, table_name: text, record_id: text,
                old_data: { [text]: 'old' }, new_data: { [text]: text } }],
            drug_links: drug.drug_links, generic_links: generic.generic_links, med_error_knowledge: drug.med_error_knowledge,
            drug_nickname: drug.drug_nickname, drug_label_mapping: drug.drug_label_mapping,
            drug_nlem_mapping: drug.drug_nlem_mapping, drug_contents: drug.drug_contents,
            drug_administrations: drug.drug_administrations, external_links: [{ id: 1, title: text, category: text, description: text, url: 'javascript:window.__xss=1' }]
        };
        window.__writes = [];
        function query(table) {
            const q = { operation: 'select', first: 0, singleRow: false };
            for (const name of ['eq', 'neq', 'in', 'order', 'limit', 'match', 'gte', 'lte', 'or']) q[name] = () => q;
            q.select = columns => { q.columns = columns; return q; };
            q.range = first => { q.first = first; return q; };
            q.single = q.maybeSingle = () => { q.singleRow = true; return q; };
            for (const op of ['insert', 'upsert', 'delete', 'update']) q[op] = payload => {
                q.operation = op; window.__writes.push({ table, operation: op, payload });
                if (table === 'enteral_nutrients' && op === 'upsert') {
                    window.__fixtures[table] = window.__fixtures[table].filter(row => row.drug_code !== payload.drug_code);
                    window.__fixtures[table].push(structuredClone(payload));
                }
                return q;
            };
            q.then = (yes, no) => Promise.resolve(fixtureOptions.missingBasisColumn && table === 'enteral_nutrients' && q.columns === 'base_kcal'
                ? { data: null, error: { code: '42703', message: 'column base_kcal does not exist' } } : {
                data: q.operation !== 'select' ? [] : q.first ? [] : q.singleRow ? null : structuredClone(window.__fixtures[table] || []), error: null
            }).then(yes, no);
            return q;
        }
        window.__verifiedIvUser = fixtureOptions.ivSignedOut ? null : { id: 'user-1', email: 'test@example.test', is_anonymous: !!fixtureOptions.ivAnonymous };
        window.__ivAuthError = !!fixtureOptions.ivAuthError;
        window.__authCallbacks = [];
        window.__geoMode = fixtureOptions.geoMode || 'inside';
        window.__geoCalls = 0;
        window.__geoPending = [];
        window.__mockClient = {
            from: query, rpc: async () => ({ data: null, error: null }),
            auth: { getSession: async () => ({ data: { session: { user: { email: 'test@example.test' } } } }),
                getUser: async () => {
                    if (window.__ivAuthError) throw new Error('Auth unavailable');
                    return { data: { user: window.__verifiedIvUser }, error: null };
                },
                onAuthStateChange: callback => { window.__authCallbacks.push(callback); return {}; },
                signInWithPassword: async ({ email }) => {
                    if (window.__ivLoginFailure) return { data: {}, error: { message: '<img src=x> invalid credentials' } };
                    window.__verifiedIvUser = { id: 'user-1', email, is_anonymous: false };
                    return { data: { session: { user: window.__verifiedIvUser } }, error: null };
                },
                signOut: async () => { window.__verifiedIvUser = null; window.__authCallbacks.forEach(callback => callback('SIGNED_OUT', null)); return { error: null }; }
            }
        };
        Object.defineProperty(navigator, 'geolocation', { value: fixtureOptions.geoMode === 'unsupported' ? undefined : { getCurrentPosition: (yes, no) => {
            window.__geoCalls++;
            if (window.__geoMode === 'deferred') { window.__geoPending.push({ yes, no }); return; }
            if (window.__geoMode === 'denied') return no({ code: 1 });
            if (window.__geoMode === 'timeout') return no({ code: 3 });
            if (window.__geoMode === 'unavailable') return no({ code: 2 });
            return yes({ coords: window.__geoMode === 'outside' ? { latitude: 14, longitude: 101 } : { latitude: 13.7665, longitude: 100.5272 } });
        } } });
    }, { text, code, fixtureOptions });
    await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'ramaclinic.test') {
            const filePath = path.join(root, decodeURIComponent(url.pathname));
            if (!filePath.startsWith(root + path.sep) || !fs.existsSync(filePath)) return route.fulfill({ status: 404, body: '' });
            return route.fulfill({ contentType: filePath.endsWith('.js') ? 'text/javascript' : 'text/html', body: fs.readFileSync(filePath) });
        }
        if (url.href.includes('@supabase')) return route.fulfill({ contentType: 'text/javascript', body: 'window.supabase={createClient:()=>window.__mockClient};' });
        if (url.href.includes('chart.js')) return route.fulfill({ contentType: 'text/javascript', body: 'window.Chart=class{destroy(){}};' });
        return route.fulfill({ body: '', contentType: route.request().resourceType() === 'script' ? 'text/javascript' : 'text/plain' });
    });
    try {
        await page.goto(`http://ramaclinic.test/${file}.html`);
        await run(page);
        assert.deepEqual(errors, [], 'page must not throw JavaScript errors');
        assert.equal(await page.evaluate(() => window.__xss), undefined, 'payload must never execute');
        assert.equal(await page.locator('svg[onload],img[onerror],script:not([src])').evaluateAll(nodes => nodes.filter(n => n.tagName !== 'SCRIPT').length), 0);
    } catch (error) {
        console.error(file, errors, (await page.locator('body').innerText()).slice(-1800));
        throw error;
    } finally { await page.close(); }
}

test('text escaping, safe URLs, rich HTML sanitizer, and event binding', async () => {
    await openPage('drug_compare', async page => {
        const result = await page.evaluate(({ text }) => {
            const host = document.createElement('div'); document.body.append(host);
            let received;
            setHTML(host, `<button ${bindHTMLAction('click', function(event) { received = [text, this.tagName, event.type]; })}>${encodeHTML(text)}</button>`);
            host.querySelector('button').click();
            const rich = safeRichHTML('<b>อัปเดต</b><script>window.__xss=1</script><img src=x onerror="window.__xss=1"><a href="javascript:window.__xss=1">link</a><iframe srcdoc="bad"></iframe>');
            setHTML(host, rich);
            return { received, rich, rejected: ['javascript:alert(1)', 'data:text/html,bad', 'vbscript:bad'].map(safeURL), safe: safeURL('https://example.test/a?q=1&b=2'), breaks: textWithBreaks('Dose <30\n≥60 & A'), clinical: encodeHTML('<30 ≥60 & "A"'), zero: encodeHTML(0) };
        }, { text });
        assert.deepEqual(result.received, [text, 'BUTTON', 'click']);
        assert.deepEqual(result.rejected, ['', '', '']);
        assert.ok(result.rich.includes('<b>อัปเดต</b>'));
        assert.ok(!/script|iframe|onerror|javascript:/i.test(result.rich));
        assert.equal(result.zero, '0');
        assert.equal(result.breaks, 'Dose &lt;30<br>≥60 &amp; A');
        assert.equal(result.clinical, '&lt;30 ≥60 &amp; &quot;A&quot;');
    });
});

test('main drug cards preserve raw names and bind edit buttons without inline handlers', async () => {
    await openPage('index', async page => {
        await page.waitForSelector('.drug-card');
        assert.ok((await page.locator('.drug-card').textContent()).includes(text));
        assert.equal(await page.locator('.drug-card [onclick]').count(), 0);
        assert.equal(await page.locator('.drug-card svg,.drug-card img[onerror]').count(), 0);
        await page.locator('.admin-actions button').filter({ hasText: 'แก้ไข' }).click();
        assert.equal(await page.locator('#form-drug-code').inputValue(), code);
        assert.equal(await page.locator('#form-drug-name').inputValue(), text.replace(/\n/g, ''));
        await page.evaluate(() => closeModal('drug-modal'));
        await page.locator('.drug-card .clickable-header').click();
        assert.ok((await page.locator('.card-body').getAttribute('class')).includes('expanded'));
        await page.evaluate(async code => { await toggleInlineAdj(code); }, code);
        assert.ok((await page.locator('[id^="inline-adj-container-"]').textContent()).includes(text));
        await page.evaluate(code => calculateInlineCrCl(code), code);
    });
});

test('main notes, logs, links and gene/lab viewers render database fields as text', async () => {
    await openPage('index', async page => {
        await page.waitForSelector('.drug-card');
        await page.evaluate(async code => {
            openMeKnowledge(code); await fetchLogs(); openGeneViewer(); openLinkViewer(code); openExternalLinksModal(); openCalculator(code);
        }, code);
        for (const id of ['me-knowledge-list', 'log-table-container', 'gene-viewer-list', 'link-viewer-content', 'external-links-list']) {
            if (await page.locator(`#${id}`).count()) {
                assert.equal(await page.locator(`#${id} img,#${id} svg,#${id} iframe`).count(), 0, id);
            }
        }
        assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
    });
});

test('drug comparison search, selection, card and removal support hostile text', async () => {
    await openPage('drug_compare', async page => {
        await page.waitForFunction(() => basicDrugList.length > 0);
        await page.locator('#search-input').fill('O\'Brien');
        await page.evaluate(() => handleSearch());
        assert.ok((await page.locator('#search-items-list').textContent()).includes(text));
        await page.locator('.search-item').click();
        await page.evaluate(() => addSelectedDrugs());
        await page.locator('#compare-table th').filter({ hasText: "O'Brien" }).click();
        assert.ok((await page.locator('#card-body-content').textContent()).includes(text));
        assert.equal(await page.locator('#card-body-content img,#card-body-content svg').count(), 0);
        await page.evaluate(() => closeModal('drug-card-modal'));
        await page.locator('.chip-remove').click();
        assert.equal(await page.locator('.chip').count(), 0);
    });
});

test('management lists escape notes, aliases, labels, routes and clinical recommendations', async () => {
    await openPage('index', async page => {
        await page.waitForSelector('.drug-card');
        await page.evaluate(async ({ code, text }) => {
            await fetchCurrentAdmins(code);
            await fetchCurrentIngredients(code);
            await fetchCurrentNlem(code);
            await fetchCurrentLabelMapping(code);
            await fetchAdjRules('G1');
            await fetchCurrentMeRules(code);
            await fetchCurrentLinksAdmin('drug', code);
            await fetchGeneLabs('G1');
            await fetchCurrentAliases(code);
            renderBulkNlemDrugs(allDrugsRaw);
            renderBulkPharmGenerics();
            renderBulkGeneLabGenerics();
            document.getElementById('search-pharm-input').value = "O'Brien";
            showPharmSuggestions();
        }, { code, text });
        for (const id of ['current-admin-list', 'current-ingredients-list', 'current-nlem-list', 'current-label-mapping-list', 'current-alias-list']) {
            assert.equal(await page.locator(`#${id} img,#${id} svg`).count(), 0);
        }
        const selected = await page.evaluate(() => {
            const suggestion = document.querySelector('#pharm-suggestions .suggestion-item');
            if (suggestion) suggestion.click();
            return activePharmTags;
        });
        assert.equal(await page.locator('svg[onload],img[onerror]').count(), 0);
        assert.deepEqual(selected, [text]);
    });
});

test('enteral comparison preserves operators, values and edit form arguments', async () => {
    await openPage('enteral_compare', async page => {
        await page.waitForSelector('.product-cb', { state: 'attached' });
        await page.locator('label[for^="sel-"]').click();
        assert.ok((await page.locator('#compare-table').innerText()).includes('< 0.01'));
        assert.equal(await page.locator('#compare-table img,#compare-table svg').count(), 0);
        await page.locator('#compare-table button').filter({ hasText: 'แก้ไขสารอาหาร' }).click();
        assert.equal(await page.locator('#admin-drug-code').inputValue(), code);
        assert.equal(await page.locator('.key-input').first().inputValue(), text.replace(/\n/g, ''));
        await page.locator('.json-item button').first().click();
        assert.equal(await page.locator('.json-item').count(), 0);
    });
});

test('IV search, pair details, edit form object and remove buttons remain usable', async () => {
    await openPage('iv_compat', async page => {
        await page.waitForFunction(() => ivAliasDict.length > 0);
        await page.locator('#iv-search-input').fill("O'Brien");
        await page.evaluate(() => showIvSuggestions());
        await page.locator('.suggestion-item').first().click();
        await page.evaluate(() => addDrugToIvList());
        await page.evaluate(() => { selectIvDrug('B', 'B'); addDrugToIvList(); });
        await page.locator('#btn-analyze').click();
        assert.ok((await page.locator('#iv-pairs-container').textContent()).includes(text));
        assert.equal(await page.locator('#iv-pairs-container img,#iv-pairs-container svg').count(), 0);
        await page.evaluate(async () => { openAdminModal(); switchAdminTab('pairs'); await fetchAdminList(); });
        await page.locator('#admin-table-container button').filter({ hasText: 'แก้ไข' }).click();
        assert.equal(await page.locator('#admin-detail').inputValue(), text);
        await page.evaluate(() => closeAdminModal());
        await page.locator('.drug-chip .remove').first().click();
        assert.equal(await page.locator('.drug-chip').count(), 1);
    });
});

test('renal tables use only their own metric, retain independent values, and clear old highlights', async () => {
    await openPage('index', async page => {
        await page.waitForSelector('.drug-card');
        const result = await page.evaluate(async code => {
            window.__fixtures.generic_adjustments = ['CrCl', 'eGFR'].map(criterion_type => ({
                generic_code: 'G1', adj_type: 'renal', criterion_type, min_value: 0, max_value: 200, recommendation: 'ตรวจ Reference'
            }));
            await toggleInlineAdj(code);
            const get = prefix => document.getElementById(`${prefix}-${code}`);
            const count = metric => [...document.querySelectorAll(`.${CSS.escape(`${metric}-row-${code}`)}`)].filter(row => row.style.backgroundColor !== '').length;
            get('manual-egfr').value = '45';
            calculateInlineCrCl(code);
            const manualOnly = { crcl: get('result-crcl').innerText, egfr: get('result-egfr').innerText, yellow: count('crcl'), green: count('egfr'), warning: get('dynamic-warning').innerText, method: get('egfr-label').innerText, source: get('egfr-source').innerText };
            get('calc-wt').value = '70'; get('calc-ht').value = '170';
            calculateInlineCrCl(code);
            const absoluteOnly = { absolute: get('result-abs-gfr').innerText, yellow: count('crcl') };
            get('calc-age').value = '60'; get('calc-scr').value = '1';
            calculateInlineCrCl(code);
            const both = { crcl: get('result-crcl').innerText, egfr: get('result-egfr').innerText, yellow: count('crcl'), green: count('egfr') };
            get('manual-egfr').value = '-5';
            calculateInlineCrCl(code);
            const invalidManual = { egfr: get('result-egfr').innerText, yellow: count('crcl'), green: count('egfr'), warning: get('dynamic-warning').innerText, method: get('egfr-label').innerText, source: get('egfr-source').innerText };
            clearInlineCrCl(code);
            const cleared = { yellow: count('crcl'), green: count('egfr'), warning: get('dynamic-warning').innerText, method: get('egfr-label').innerText, source: get('egfr-source').innerText };
            return { manualOnly, absoluteOnly, both, invalidManual, cleared };
        }, code);
        assert.equal(result.manualOnly.crcl, '-');
        assert.equal(result.manualOnly.egfr, '45.0');
        assert.equal(result.manualOnly.yellow, 0);
        assert.equal(result.manualOnly.green, 1);
        assert.equal(result.manualOnly.method, 'eGFR (ค่าจาก Lab):');
        assert.ok(result.manualOnly.source.includes('ตรวจสอบสูตรจากรายงานผล'));
        assert.ok(result.manualOnly.warning.includes('ข้อมูลไม่เพียงพอ'));
        assert.notEqual(result.absoluteOnly.absolute, '-');
        assert.equal(result.absoluteOnly.yellow, 0, 'Absolute GFR must never substitute for CrCl');
        assert.equal(result.both.crcl, '77.8');
        assert.equal(result.both.egfr, '45.0');
        assert.equal(result.both.yellow, 1);
        assert.equal(result.both.green, 1);
        assert.equal(result.invalidManual.egfr, '-');
        assert.equal(result.invalidManual.yellow, 1);
        assert.equal(result.invalidManual.green, 0);
        assert.ok(result.invalidManual.warning.includes('ไม่ถูกต้อง'));
        assert.equal(result.cleared.yellow + result.cleared.green, 0);
        assert.equal(result.cleared.method, 'eGFR (CKD-EPI 2021, creatinine):');
        assert.ok(result.cleared.warning.includes('CrCl') && result.cleared.warning.includes('eGFR'));
    });
});

test('overlap detection is scoped to a metric and generic, and recovers away from a boundary', async () => {
    await openPage('index', async page => {
        await page.waitForSelector('.drug-card');
        const result = await page.evaluate(async code => {
            const drug = allDrugsRaw[0];
            drug.drug_contents.push({ generics: { generic_code: 'G2', generic_name: 'Second generic', needs_renal_adj: true } });
            window.__fixtures.generic_adjustments = [
                { generic_code: 'G1', criterion_type: 'eGFR', adj_type: 'renal', min_value: 0, max_value: 30, recommendation: 'A' },
                { generic_code: 'G1', criterion_type: 'eGFR', adj_type: 'renal', min_value: 30, max_value: 60, recommendation: 'B' },
                { generic_code: 'G2', criterion_type: 'eGFR', adj_type: 'renal', min_value: 0, max_value: 60, recommendation: 'C' }
            ];
            await toggleInlineAdj(code);
            const input = document.getElementById(`manual-egfr-${code}`);
            const snapshot = () => {
                const rows = [...document.querySelectorAll(`.${CSS.escape(`egfr-row-${code}`)}`)];
                return { colors: rows.map(row => row.style.backgroundColor), warning: document.getElementById(`dynamic-warning-${code}`).innerText };
            };
            input.value = '30'; calculateInlineCrCl(code);
            const boundary = snapshot();
            input.value = '29.9'; calculateInlineCrCl(code);
            return { boundary, recovered: snapshot() };
        }, code);
        assert.deepEqual(result.boundary.colors.slice(0, 2), ['', '']);
        assert.notEqual(result.boundary.colors[2], '');
        assert.ok(result.boundary.warning.includes('ทับซ้อน'));
        assert.equal(result.recovered.colors.filter(Boolean).length, 2, 'different generic tables may each have one match');
        assert.ok(!result.recovered.warning.includes('ทับซ้อน'));
    });
});

test('invalid and uncovered ranges are reported without choosing a recommendation', async () => {
    await openPage('index', async page => {
        const result = await page.evaluate(() => {
            const root = document.createElement('div');
            setHTML(root, '<table><tr class="test-row" data-min="abc" data-max="60"><td>Bad rule</td></tr><tr class="test-row" data-min="0" data-max="60"><td>Would match</td></tr></table>');
            const invalid = highlightAdjustmentRows(root, '.test-row', 30, '#fef08a');
            const invalidCount = [...root.querySelectorAll('tr')].filter(row => row.style.backgroundColor).length;
            setHTML(root, '<table><tr class="test-row" data-min="0" data-max="10"><td>Range</td></tr></table>');
            const uncovered = highlightAdjustmentRows(root, '.test-row', 30, '#fef08a');
            return { invalid, invalidCount, uncovered };
        });
        assert.equal(result.invalid.invalidRange, true);
        assert.equal(result.invalidCount, 0);
        assert.equal(result.uncovered.noMatch, true);
    });
});

test('reference warning is prominent even with no adjustment data, and appears in the modal', async () => {
    await openPage('index', async page => {
        await page.waitForSelector('.drug-card');
        await page.evaluate(async code => {
            window.__fixtures.generic_adjustments = [];
            await toggleInlineAdj(code);
        }, code);
        const banner = page.locator('[id^="inline-adj-container-"] .adjustment-reference-warning');
        assert.ok((await banner.innerText()).includes('อาจมีการอัปเดต'));
        assert.ok((await banner.innerText()).includes('Reference ปัจจุบันเสมอ'));
        assert.ok((await banner.innerText()).includes('Lexidrug app'));
        assert.ok((await banner.innerText()).includes('Sanford Guide สำหรับยาปฏิชีวนะ'));
        assert.equal(await banner.locator('a').getAttribute('href'), 'https://www.micromedexsolutions.com/micromedex2/librarian/');
        assert.equal(await banner.evaluate(node => getComputedStyle(node).borderLeftWidth), '8px');
        assert.ok((await page.locator('[id^="inline-adj-container-"]').innerText()).includes('ไม่สามารถสรุปว่าไม่ต้องปรับขนาดยา'));
        await page.setViewportSize({ width: 390, height: 844 });
        if (process.env.RENAL_WARNING_SCREENSHOT) await banner.screenshot({ path: process.env.RENAL_WARNING_SCREENSHOT });
        await page.evaluate(code => openAdjustmentModal(code), code);
        assert.equal(await page.locator('#adjustment-reference-warning .adjustment-reference-warning').count(), 1);
        assert.ok((await page.locator('#adj-content-container').innerText()).includes('ไม่สามารถสรุปว่าไม่ต้องปรับขนาดยา'));
    });
});

test('legacy CrCl modal suppresses ambiguous boundary highlights too', async () => {
    await openPage('index', async page => {
        await page.waitForSelector('.drug-card');
        const result = await page.evaluate(async code => {
            await openAdjustmentModal(code);
            renderAdjustments([
                { generic_code: 'G1', criterion_type: 'CrCl', adj_type: 'renal', min_value: 0, max_value: 30, recommendation: 'A' },
                { generic_code: 'G1', criterion_type: 'CrCl', adj_type: 'renal', min_value: 30, max_value: 60, recommendation: 'B' }
            ], allDrugsRaw[0].drug_contents);
            document.getElementById('calc-age').value = '80';
            document.getElementById('calc-weight').value = '72';
            document.getElementById('calc-scr').value = '2';
            calculateCrCl();
            return { value: document.getElementById('result-crcl').innerText,
                highlighted: [...document.querySelectorAll('#adjustment-modal .crcl-row')].filter(row => row.style.backgroundColor).length,
                warning: document.getElementById('modal-adjustment-warning').innerText };
        }, code);
        assert.equal(result.value, '30.0');
        assert.equal(result.highlighted, 0);
        assert.ok(result.warning.includes('ทับซ้อน'));
    });
});

test('label quantities and 250 kcal basis survive save and reopen without normalization', async () => {
    await openPage('enteral_compare', async page => {
        await page.waitForFunction(() => allEnteralDrugs.length > 0 && nutrientBasisAvailable);
        const result = await page.evaluate(async code => {
            delete nutrientsData[code];
            openAdminModal(code, 'Label product');
            document.getElementById('admin-base-kcal').value = '250';
            addJsonItem('admin-macros-list', 'Protein (g)', '10.00');
            addJsonItem('admin-macros-list', 'Fat (g)', '0');
            addJsonItem('admin-minerals-list', 'Sodium', '1,000 mg');
            addJsonItem('admin-vitamins-list', 'Trace', '<0.01 mg');
            await saveNutrientData();
            const payload = window.__writes.find(write => write.table === 'enteral_nutrients').payload;
            await fetchNutrients();
            openAdminModal(code, 'Label product');
            const reopened = {
                base: document.getElementById('admin-base-kcal').value,
                values: [...document.querySelectorAll('#admin-macros-list .val-input')].map(input => input.value)
            };
            document.getElementById('admin-modal').style.display = 'none';
            document.querySelector('.product-cb').checked = true;
            renderTable();
            const display100 = document.getElementById('compare-table').innerText;
            document.getElementById('compare-base-kcal').value = '200'; renderTable();
            return { payload, reopened, display100, display200: document.getElementById('compare-table').innerText };
        }, code);
        assert.equal(result.payload.base_kcal, 250);
        assert.equal(result.payload.macros['Protein (g)'], '10.00');
        assert.equal(result.payload.macros['Fat (g)'], '0');
        assert.equal(result.payload.minerals.Sodium, '1,000 mg');
        assert.equal(result.payload.vitamins.Trace, '<0.01 mg');
        assert.equal(result.reopened.base, '250');
        assert.deepEqual(result.reopened.values, ['0', '10.00']);
        assert.ok(result.display100.includes('4.00'));
        assert.ok(result.display100.includes('0.00'));
        assert.ok(result.display100.includes('400.00 mg'));
        assert.ok(result.display100.includes('< 0.004 mg'));
        assert.ok(result.display100.includes('ข้อมูลต้นฉบับต่อ 250 kcal'));
        assert.ok(result.display200.includes('8.00'));
    });
});

test('mixed label bases compare on equal energy while legacy records retain a 100 kcal basis', async () => {
    await openPage('enteral_compare', async page => {
        await page.waitForFunction(() => allEnteralDrugs.length > 0);
        const result = await page.evaluate(code => {
            const legacy = { ...allEnteralDrugs[0], drug_code: 'LEGACY', drug_name: 'Legacy normalized data' };
            allEnteralDrugs.push(legacy);
            nutrientsData[code] = { drug_code: code, base_kcal: 250, macros: { Protein: 10 } };
            nutrientsData.LEGACY = { drug_code: 'LEGACY', macros: { Protein: 4 } };
            renderSelectors();
            document.querySelectorAll('.product-cb').forEach(input => { input.checked = true; });
            renderTable();
            const at100 = [...document.querySelectorAll('#compare-table tbody tr:last-child td')].slice(1).map(cell => cell.textContent);
            document.getElementById('compare-base-kcal').value = '200'; renderTable();
            const at200 = [...document.querySelectorAll('#compare-table tbody tr:last-child td')].slice(1).map(cell => cell.textContent);
            openAdminModal('LEGACY', 'Legacy normalized data');
            return { at100, at200, legacyBase: document.getElementById('admin-base-kcal').value, writes: window.__writes.length };
        }, code);
        assert.deepEqual(result.at100, ['4.00', '4.00']);
        assert.deepEqual(result.at200, ['8.00', '8.00']);
        assert.equal(result.legacyBase, '100');
        assert.equal(result.writes, 0);
    });
});

test('invalid bases, duplicate keys and unconfirmed basis changes never write data', async () => {
    await openPage('enteral_compare', async page => {
        await page.waitForFunction(() => nutrientBasisAvailable);
        const result = await page.evaluate(async code => {
            openAdminModal(code, 'Product');
            for (const base of ['', '0', '-1']) {
                document.getElementById('admin-base-kcal').value = base;
                await saveNutrientData();
            }
            document.getElementById('admin-base-kcal').value = '250';
            updateNutrientBasisNotice();
            const changeWarning = document.getElementById('admin-basis-change-warning').innerText;
            window.confirm = () => false;
            await saveNutrientData();
            document.getElementById('admin-base-kcal').value = '100';
            setHTML(document.getElementById('admin-macros-list'), '');
            addJsonItem('admin-macros-list', 'Protein', '10');
            addJsonItem('admin-macros-list', 'Protein', '20');
            await saveNutrientData();
            return { changeWarning, writes: window.__writes.length, editorOpen: document.getElementById('admin-modal').style.display };
        }, code);
        assert.ok(result.changeWarning.includes('ไม่ถูกคูณหรือหารอัตโนมัติ'));
        assert.equal(result.writes, 0);
        assert.equal(result.editorOpen, 'block');
    });
});

test('missing database column blocks label-basis saves but preserves legacy 100 kcal editing', async () => {
    await openPage('enteral_compare', async page => {
        await page.waitForFunction(() => allEnteralDrugs.length > 0);
        const result = await page.evaluate(async code => {
            await fetchNutrients();
            openAdminModal(code, 'Legacy product');
            document.getElementById('admin-base-kcal').value = '250';
            await saveNutrientData();
            const blocked = window.__writes.length;
            document.getElementById('admin-base-kcal').value = '100';
            await saveNutrientData();
            return { supported: nutrientBasisAvailable, blocked, writes: window.__writes };
        }, code);
        assert.equal(result.supported, false);
        assert.equal(result.blocked, 0);
        assert.equal(result.writes.length, 1);
        assert.ok(!Object.prototype.hasOwnProperty.call(result.writes[0].payload, 'base_kcal'));
    }, { missingBasisColumn: true });
});

test('label parser retains operators and units without inventing an exact ranking', async () => {
    await openPage('enteral_compare', async page => {
        const result = await page.evaluate(() => ({
            comma: formatNutrientValue('1,000 mg', 0.4),
            operator: formatNutrientValue('≥ 10 mg', 0.4),
            malformed: formatNutrientValue('1,00 mg', 0.4),
            invalidBase: formatNutrientValue(10, NaN)
        }));
        assert.equal(result.comma.display, '400.00 mg');
        assert.equal(result.operator.display, '≥ 4 mg');
        assert.equal(result.operator.numForCompare, null);
        assert.ok(result.malformed.display.includes('ไม่แปลงสัดส่วน'));
        assert.equal(result.malformed.numForCompare, null);
        assert.equal(result.invalidBase.display, 'ตรวจสอบฐาน kcal');
    });
});

for (const file of ['index', 'enteral_compare']) {
test(file + ': ready-to-feed calculator blocks impossible concentrations, clears stale results, and recovers', async () => {
    await openPage(file, async page => {
        await page.waitForFunction(() => typeof allEnteralDrugs !== 'undefined' ? allEnteralDrugs.length > 0 : allDrugsRaw.length > 0);
        await page.evaluate(() => { window.__nutritionTestDrugs = typeof allEnteralDrugs !== 'undefined' ? allEnteralDrugs : allDrugsRaw; });
        await page.evaluate(() => {
            window.__nutritionTestDrugs[0].nutrition_configs = { product_type: 'liquid', serving_volume_ml: 250, serving_kcal: 250,
                protein_per_serving: 10, carb_per_serving: 30, fat_per_serving: 10 };
            openNutriCalc(window.__nutritionTestDrugs[0].drug_code);
        });
        assert.equal(await page.locator('#nutri-calc-ratio option[value="1.5"]').isDisabled(), true);
        await page.locator('#nutri-calc-volume').fill('300');
        assert.equal(await page.locator('#nutri-res-gram').innerText(), '300');
        assert.equal(await page.locator('#nutri-res-kcal').innerText(), '300');
        assert.equal(await page.locator('#nutri-res-water-section').isVisible(), true);
        assert.match(await page.locator('#lbl-water-title').innerText(), /ไม่เติมน้ำ/);
        await page.locator('#nutri-calc-ratio').selectOption('custom');
        await page.locator('#nutri-calc-ratio-custom').fill('1.5');
        assert.equal(await page.locator('#nutri-calc-results').isVisible(), false);
        assert.match(await page.locator('#nutri-calc-warning').innerText(), /สูงกว่าสูตรน้ำต้นฉบับ/);
        for (const id of ['scoop', 'gram', 'vol', 'kcal', 'protein', 'carb', 'fat']) {
            assert.equal(await page.locator(`#nutri-res-${id}`).innerText(), '-');
        }
        await page.locator('#nutri-calc-ratio-custom').fill('0.8');
        assert.equal(await page.locator('#nutri-calc-warning').isVisible(), false);
        assert.equal(await page.locator('#nutri-res-gram').innerText(), '240');
        assert.equal(await page.locator('#nutri-res-vol').innerText(), '300');
        assert.equal(await page.locator('#nutri-res-kcal').innerText(), '240');
        assert.equal(await page.locator('#nutri-res-protein').innerText(), '9.6');
        assert.match(await page.locator('#lbl-water-title').innerText(), /เจือจาง/);
        // No 1 ml tolerance: even slight over-concentration must be blocked.
        await page.locator('#nutri-calc-ratio-custom').fill('1.0001');
        assert.equal(await page.locator('#nutri-calc-results').isVisible(), false);
        for (const value of [0, -1, Infinity, NaN]) {
            await page.evaluate(value => {
                document.getElementById('nutri-calc-ratio').value = '1';
                activeNutriConfig.serving_kcal = value;
                runNutriCalc();
            }, value);
            assert.equal(await page.locator('#nutri-calc-results').isVisible(), false);
        }
        await page.evaluate(() => {
            window.__nutritionTestDrugs[0].nutrition_configs.serving_kcal = 250;
            openNutriCalc(window.__nutritionTestDrugs[0].drug_code);
        });
        assert.equal(await page.locator('#nutri-calc-results').isVisible(), false);
        assert.equal(await page.locator('#nutri-calc-warning').isVisible(), false);
    });
});

test(file + ': powder concentration selection and calculation remain available', async () => {
    await openPage(file, async page => {
        await page.waitForFunction(() => typeof allEnteralDrugs !== 'undefined' ? allEnteralDrugs.length > 0 : allDrugsRaw.length > 0);
        await page.evaluate(() => { window.__nutritionTestDrugs = typeof allEnteralDrugs !== 'undefined' ? allEnteralDrugs : allDrugsRaw; });
        await page.evaluate(() => openNutriCalc(window.__nutritionTestDrugs[0].drug_code));
        assert.equal(await page.locator('#nutri-calc-ratio option[value="2"]').isDisabled(), false);
        await page.locator('#nutri-calc-ratio').selectOption('2');
        await page.locator('#nutri-calc-volume').fill('300');
        assert.equal(await page.locator('#nutri-res-kcal').innerText(), '600');
        assert.equal(await page.locator('#nutri-res-scoop').innerText(), '12.0');
        assert.equal(await page.locator('#nutri-res-gram').innerText(), '60.0');
        await page.locator('#nutri-calc-volume').fill('');
        assert.equal(await page.locator('#nutri-calc-results').isVisible(), false);
    });
});

}

test('administration editor uses one RPC, preserves failed inputs, and prevents duplicate submission', async () => {
    await openPage('index', async page => {
        await page.waitForFunction(() => allDrugsRaw.length > 0);
        await page.evaluate(async () => {
            await openAdminManager(allDrugsRaw[0].drug_code, 'Test');
            editingAdminId = 1;
            document.getElementById('input-instruction').value = '60 min';
            document.getElementById('input-min-conc').value = '0';
            document.getElementById('input-max-conc').value = '10';
            document.getElementById('input-conc-unit').value = 'mg/ml';
            document.querySelector('input[name="comp-fluids"]').checked = true;
            window.__rpcCalls = [];
            window.__mockClient.rpc = (name, args) => {
                window.__rpcCalls.push({name, args});
                return new Promise(resolve => { window.__finishSave = resolve; });
            };
            window.__savePromise = addAdministration();
            await addAdministration();
        });
        assert.equal(await page.locator('#btn-save-admin').isDisabled(), true);
        assert.equal(await page.locator('#input-instruction').isDisabled(), true);
        assert.equal(await page.evaluate(() => window.__rpcCalls.length), 1);
        const sent = await page.evaluate(() => window.__rpcCalls[0]);
        assert.equal(sent.name, 'save_administration_with_fluids');
        assert.equal(sent.args.p_administration_id, 1);
        assert.equal(sent.args.p_instructions, '60 min');
        assert.equal(sent.args.p_min_conc, 0);
        assert.equal(sent.args.p_max_conc, 10);
        assert.equal(sent.args.p_fluid_names.length, 1);
        await page.evaluate(async () => {
            window.__finishSave({data: null, error: {message: '<img src=x onerror="window.__xss=1"> fluid insert failed'}});
            await window.__savePromise;
        });
        assert.equal(await page.locator('#input-instruction').inputValue(), '60 min');
        assert.equal(await page.evaluate(() => editingAdminId), 1);
        assert.equal(await page.locator('#btn-save-admin').isDisabled(), false);
        assert.equal(await page.locator('#admin-save-error').isVisible(), true);
        assert.equal(await page.locator('#admin-save-error img').count(), 0);
        assert.equal(await page.locator('input[name="comp-fluids"]:checked').count(), 1);
        assert.equal(await page.evaluate(() => window.__writes.filter(w => ['drug_administrations','administration_fluids'].includes(w.table)).length), 0);
        await page.evaluate(async () => {
            window.__mockClient.rpc = async () => ({data: 1, error: null});
            await addAdministration();
        });
        assert.equal(await page.locator('#input-instruction').inputValue(), '');
        assert.equal(await page.evaluate(() => editingAdminId), null);
        assert.equal(await page.locator('#admin-save-error').isVisible(), false);
        assert.equal(await page.locator('#btn-save-admin').isDisabled(), false);
    });
});

test('administration create and copy keep forms on network failure or missing RPC without unsafe fallback', async () => {
    await openPage('index', async page => {
        await page.waitForFunction(() => allDrugsRaw.length > 0);
        await page.evaluate(async () => {
            await openAdminManager(allDrugsRaw[0].drug_code, 'Test');
            document.getElementById('input-instruction').value = '30 min';
            window.__rpcCalls = [];
        });
        for (const mode of ['network', 'missing', 'empty']) {
            await page.evaluate(async mode => {
                window.__mockClient.rpc = async (name, args) => {
                    window.__rpcCalls.push({name,args});
                    if (mode === 'network') throw new Error('Network lost');
                    return mode === 'missing' ? {data:null,error:{message:'Function not found',code:'PGRST202'}} : {data:null,error:null};
                };
                await addAdministration();
            }, mode);
            assert.equal(await page.locator('#input-instruction').inputValue(), '30 min');
            assert.equal(await page.locator('#admin-save-error').isVisible(), true);
            assert.equal(await page.locator('#btn-save-admin').isDisabled(), false);
        }
        const args = await page.evaluate(() => window.__rpcCalls[0].args);
        assert.equal(args.p_administration_id, null);
        assert.deepEqual(args.p_fluid_names, []);
        assert.equal(await page.evaluate(() => window.__writes.filter(w => ['drug_administrations','administration_fluids'].includes(w.table)).length), 0);
    });
});

test('bulk administration copy counts only complete saves and aborts if source fluids cannot be read', async () => {
    await openPage('index', async page => {
        await page.waitForFunction(() => allDrugsRaw.length > 0);
        await page.evaluate(async () => {
            await openAdminManager(allDrugsRaw[0].drug_code, 'Test');
            document.getElementById('bulk-copy-admin-id').value = '1';
            const group = document.getElementById('bulk-copy-target-list');
            group.replaceChildren();
            for (const value of ['TARGET1','TARGET2']) {
                const checkbox = document.createElement('input');
                checkbox.type='checkbox'; checkbox.name='bulk-target-drugs'; checkbox.value=value; checkbox.checked=true;
                group.append(checkbox);
            }
            window.__fixtures.administration_fluids = [{administration_id:1,fluid_short_name:'NSS'}];
            window.__rpcCalls = [];
            window.__mockClient.rpc = async (name,args) => {
                window.__rpcCalls.push({name,args});
                return args.p_drug_code === 'TARGET1' ? {data: 2,error:null} : {data:null,error:{message:'fluid rejected'}};
            };
            await executeBulkCopyAdmin();
        });
        assert.equal(await page.locator('input[name="bulk-target-drugs"][value="TARGET1"]').isChecked(), false);
        assert.equal(await page.locator('input[name="bulk-target-drugs"][value="TARGET2"]').isChecked(), true);
        const calls = await page.evaluate(() => window.__rpcCalls);
        assert.equal(calls.length, 2);
        assert.deepEqual(calls[0].args.p_fluid_names, ['NSS']);
        await page.evaluate(async () => {
            const originalFrom = window.__mockClient.from;
            window.__mockClient.from = table => table === 'administration_fluids'
                ? {select: () => ({eq:async () => ({data:null,error:{message:'read failed'}})})}
                : originalFrom(table);
            await executeBulkCopyAdmin();
        });
        assert.equal(await page.evaluate(() => window.__rpcCalls.length), 2);
        assert.equal(await page.locator('input[name="bulk-target-drugs"][value="TARGET2"]').isChecked(), true);
        assert.equal(await page.evaluate(() => window.__writes.filter(w => ['drug_administrations','administration_fluids'].includes(w.table)).length), 0);
    });
});

test('opening an administration never replaces the form with an unread fluid selection', async () => {
    await openPage('index', async page => {
        await page.waitForFunction(() => allDrugsRaw.length > 0);
        await page.evaluate(async () => {
            await openAdminManager(allDrugsRaw[0].drug_code, 'Test');
            document.getElementById('input-instruction').value = 'Unsaved draft';
            document.querySelector('input[name="comp-fluids"]').checked = true;
            const originalFrom = window.__mockClient.from;
            window.__mockClient.from = table => table === 'administration_fluids'
                ? {select: () => ({eq:async () => ({data:null,error:{message:'read failed'}})})}
                : originalFrom(table);
            await prepareAdminForm(1, false);
        });
        assert.equal(await page.locator('#input-instruction').inputValue(), 'Unsaved draft');
        assert.equal(await page.locator('input[name="comp-fluids"]:checked').count(), 1);
        assert.equal(await page.evaluate(() => editingAdminId), null);
        assert.equal(await page.locator('#admin-save-error').isVisible(), true);
        assert.equal(await page.locator('#btn-save-admin').isDisabled(), false);
    });
});

async function prepareIngredientSaveTest(page) {
    await page.waitForFunction(() => allDrugsRaw.length > 0);
    await page.evaluate(async () => {
        window.__fixtures.drug_contents[0].generic_code = 'G1';
        await openIngredientManager(allDrugsRaw[0].drug_code, 'Test');
        prepareIngredientForm('G1');
        document.getElementById('input-amount').value = '500';
        document.getElementById('input-unit').value = 'mg';
        window.__ingredientRequests = [];
        window.__ingredientOutcome = {data:{drug_code:allDrugsRaw[0].drug_code,generic_code:'G1'},error:null};
        const originalFrom = window.__mockClient.from;
        window.__mockClient.from = table => {
            const q = originalFrom(table);
            if (table !== 'drug_contents') return q;
            for (const name of ['update','upsert']) {
                const original = q[name];
                q[name] = payload => { q.payload = payload; return original(payload); };
            }
            q.match = filter => { q.filter = filter; return q; };
            const originalThen = q.then;
            q.then = (yes,no) => {
                if (q.operation === 'select') return originalThen(yes,no);
                window.__ingredientRequests.push({operation:q.operation,payload:q.payload,filter:q.filter});
                if (window.__ingredientDeferred) return new Promise(resolve => { window.__finishIngredient = resolve; }).then(yes,no);
                if (window.__ingredientNetworkFailure) return Promise.reject(new Error('Network lost')).then(yes,no);
                return Promise.resolve(window.__ingredientOutcome).then(yes,no);
            };
            return q;
        };
    });
}

test('ingredient edits use a single matched UPDATE and preserve the form on failure', async () => {
    await openPage('index', async page => {
        await prepareIngredientSaveTest(page);
        await page.evaluate(async () => {
            window.__ingredientOutcome={data:null,error:{message:'<img src=x onerror="window.__xss=1"> constraint failure'}};
            await addIngredient();
        });
        const calls = await page.evaluate(() => window.__ingredientRequests);
        assert.equal(calls.length,1);
        assert.equal(calls[0].operation,'update');
        assert.deepEqual(calls[0].filter,{drug_code:code,generic_code:'G1'});
        assert.deepEqual(calls[0].payload,{generic_code:'G1',amount:500,unit:'mg'});
        assert.equal(await page.locator('#input-amount').inputValue(),'500');
        assert.equal(await page.locator('#input-unit').inputValue(),'mg');
        assert.equal(await page.evaluate(() => editingIngredientCode),'G1');
        assert.equal(await page.locator('#select-generic').isDisabled(),true);
        assert.equal(await page.locator('#btn-save-ingredient').isDisabled(),false);
        assert.equal(await page.locator('#ingredient-save-error').isVisible(),true);
        assert.equal(await page.locator('#ingredient-save-error img').count(),0);
        assert.equal(await page.evaluate(() => window.__writes.filter(w => w.table==='drug_contents' && w.operation==='delete').length),0);
        await page.evaluate(async () => {
            window.__ingredientOutcome={data:{drug_code:allDrugsRaw[0].drug_code,generic_code:'G1'},error:null};
            await addIngredient();
        });
        assert.equal(await page.locator('#input-amount').inputValue(),'');
        assert.equal(await page.locator('#input-unit').inputValue(),'');
        assert.equal(await page.evaluate(() => editingIngredientCode),null);
        assert.equal(await page.locator('#select-generic').isDisabled(),false);
        assert.equal(await page.locator('#ingredient-save-error').isVisible(),false);
    });
});

test('ingredient key changes stay in UPDATE and missing rows never fall back to upsert', async () => {
    await openPage('index', async page => {
        await prepareIngredientSaveTest(page);
        await page.evaluate(async () => {
            const option=document.createElement('option');option.value='G2';option.textContent='Generic B';
            document.getElementById('select-generic').append(option);
            document.getElementById('select-generic').value='G2';
            window.__ingredientOutcome={data:null,error:{message:'duplicate key'}};
            await addIngredient();
        });
        const first=await page.evaluate(() => window.__ingredientRequests[0]);
        assert.equal(first.operation,'update');
        assert.equal(first.filter.generic_code,'G1');
        assert.equal(first.payload.generic_code,'G2');
        for (const mode of ['missing','network','empty']) {
            await page.evaluate(async mode => {
                window.__ingredientNetworkFailure=mode==='network';
                window.__ingredientOutcome=mode==='missing'
                    ? {data:null,error:{message:'JSON object requested, multiple (or no) rows returned',code:'PGRST116'}}
                    : {data:null,error:null};
                await addIngredient();
            },mode);
            assert.equal(await page.evaluate(() => editingIngredientCode),'G1');
            assert.equal(await page.locator('#select-generic').inputValue(),'G2');
            assert.equal(await page.locator('#input-amount').inputValue(),'500');
            assert.equal(await page.locator('#btn-save-ingredient').isDisabled(),false);
        }
        assert.equal(await page.evaluate(() => window.__writes.filter(w=>w.table==='drug_contents' && w.operation!=='update').length),0);
    });
});

test('ingredient submit guards prevent duplicate writes and preserve blank/zero amounts', async () => {
    await openPage('index', async page => {
        await prepareIngredientSaveTest(page);
        await page.evaluate(async () => {
            window.__ingredientDeferred=true;
            window.__ingredientPromise=addIngredient();
            await addIngredient();
        });
        assert.equal(await page.evaluate(() => window.__ingredientRequests.length),1);
        assert.equal(await page.locator('#input-amount').isDisabled(),true);
        assert.equal(await page.locator('#btn-save-ingredient').isDisabled(),true);
        await page.evaluate(async () => {
            window.__finishIngredient(window.__ingredientOutcome);
            await window.__ingredientPromise;
            window.__ingredientDeferred=false;
            document.getElementById('select-generic').value='G1';
            document.getElementById('input-amount').value='0';
            document.getElementById('input-unit').value=' mg ';
            await addIngredient();
            document.getElementById('select-generic').value='G1';
            document.getElementById('input-amount').value='';
            document.getElementById('input-unit').value='';
            await addIngredient();
        });
        const calls=await page.evaluate(()=>window.__ingredientRequests);
        assert.equal(calls[1].operation,'upsert');
        assert.equal(calls[1].payload.amount,0);
        assert.equal(calls[1].payload.unit,'mg');
        assert.equal(calls[2].payload.amount,null);
        assert.equal(calls[2].payload.unit,null);
        assert.equal(await page.locator('#select-generic').isDisabled(),false);
    });
});

async function setupBulkGeneTest(page) {
    await page.waitForFunction(() => allDrugsRaw.length > 0);
    await page.evaluate(async text => {
        allGenerics.push({generic_code:'G2',generic_name:'Generic B'},{generic_code:'G3',generic_name:'Generic C'});
        // The authoritative table differs from cached generic details.
        window.__fixtures.generic_gene_lab=[{id:11,generic_code:'G1',description:text},{id:12,generic_code:'G2',description:'Advice B'}];
        openBulkGeneLabModal();
        document.getElementById('bulk-gl-test-name').value='TEST';
        await onBulkGeneLabNameChange();
        window.__geneCalls=[];
        window.__mockClient.rpc=async(name,args)=>{
            window.__geneCalls.push({name,args:structuredClone(args)});
            return {data:{selected_count:args.p_generic_codes.length},error:null};
        };
    },text);
}

test('bulk Gene/Lab loads authoritative links, previews advice safely and preserves descriptions by default',async()=>{
    await openPage('index',async page=>{
        await setupBulkGeneTest(page);
        assert.equal(await page.locator('.bulk-gl-gen-cb:checked').count(),2);
        assert.equal(await page.locator('#bulk-gl-desc').inputValue(),'');
        assert.equal(await page.locator('#bulk-gl-replace-desc').isChecked(),false);
        assert.ok((await page.locator('#bulk-gl-gen-list').innerText()).includes(text));
        assert.equal(await page.locator('#bulk-gl-gen-list img,#bulk-gl-gen-list svg').count(),0);
        await page.locator('.bulk-gl-gen-cb[value="G2"]').uncheck();
        await page.locator('.bulk-gl-gen-cb[value="G3"]').check();
        await page.locator('#bulk-gl-desc').fill('New links only');
        await page.locator('#btn-save-bulk-gl').click();
        const calls=await page.evaluate(()=>window.__geneCalls);
        assert.equal(calls.length,1);
        assert.equal(calls[0].name,'save_gene_lab_links');
        assert.deepEqual(calls[0].args.p_generic_codes.sort(),['G1','G3']);
        assert.equal(calls[0].args.p_replace_descriptions,false);
        assert.equal(calls[0].args.p_new_description,'New links only');
        assert.equal(calls[0].args.p_expected_rows[0].description,text);
        assert.equal(calls[0].args.p_expected_rows[1].description,'Advice B');
        assert.equal(await page.evaluate(()=>window.__writes.filter(w=>w.table==='generic_gene_lab').length),0);
    });
});

test('bulk description replacement and clearing all links require explicit confirmation',async()=>{
    await openPage('index',async page=>{
        await setupBulkGeneTest(page);
        await page.locator('#bulk-gl-replace-desc').check();
        await page.evaluate(()=>executeBulkGeneLabAdd()); // default dialog dismisses
        assert.equal(await page.evaluate(()=>window.__geneCalls.length),0);
        page.removeAllListeners('dialog');page.on('dialog',dialog=>dialog.accept());
        await page.evaluate(()=>executeBulkGeneLabAdd());
        let args=await page.evaluate(()=>window.__geneCalls[0].args);
        assert.equal(args.p_replace_descriptions,true);
        assert.equal(args.p_new_description,null);
        await page.evaluate(async()=>{
            openBulkGeneLabModal();document.getElementById('bulk-gl-test-name').value='TEST';
            await onBulkGeneLabNameChange();bulkGeneLabSelectedGenerics.clear();
        });
        page.removeAllListeners('dialog');page.on('dialog',dialog=>dialog.dismiss());
        await page.evaluate(()=>executeBulkGeneLabAdd());
        assert.equal(await page.evaluate(()=>window.__geneCalls.length),1);
        page.removeAllListeners('dialog');page.on('dialog',dialog=>dialog.accept());
        await page.evaluate(()=>executeBulkGeneLabAdd());
        args=await page.evaluate(()=>window.__geneCalls[1].args);
        assert.deepEqual(args.p_generic_codes,[]);
    });
});

test('bulk Gene/Lab keeps draft on RPC failure, blocks duplicate submission and stale snapshots',async()=>{
    await openPage('index',async page=>{
        await setupBulkGeneTest(page);
        await page.locator('#bulk-gl-desc').fill('Draft advice');
        await page.evaluate(async()=>{
            window.__mockClient.rpc=(name,args)=>{
                window.__geneCalls.push({name,args});
                return new Promise(resolve=>{window.__finishGene=resolve;});
            };
            window.__genePending=executeBulkGeneLabAdd();
            await executeBulkGeneLabAdd();
        });
        assert.equal(await page.locator('#btn-save-bulk-gl').isDisabled(),true);
        assert.equal(await page.evaluate(()=>window.__geneCalls.length),1);
        await page.evaluate(async()=>{
            window.__finishGene({data:null,error:{message:'<img src=x onerror="window.__xss=1"> failed'}});
            await window.__genePending;
        });
        assert.equal(await page.locator('#bulk-gl-desc').inputValue(),'Draft advice');
        assert.equal(await page.locator('.bulk-gl-gen-cb:checked').count(),2);
        assert.equal(await page.locator('#bulk-gl-error').isVisible(),true);
        assert.equal(await page.locator('#bulk-gl-error img').count(),0);
        assert.equal(await page.locator('#btn-save-bulk-gl').isDisabled(),false);
        await page.evaluate(async()=>{
            window.__mockClient.rpc=async()=>({data:null,error:{code:'40001',message:'changed'}});
            await executeBulkGeneLabAdd();
        });
        assert.equal(await page.locator('#btn-save-bulk-gl').isDisabled(),true);
        assert.equal(await page.locator('#bulk-gl-desc').inputValue(),'Draft advice');
        assert.match(await page.locator('#bulk-gl-error').innerText(),/ข้อมูลเปลี่ยน/);
        assert.equal(await page.evaluate(()=>window.__writes.filter(w=>w.table==='generic_gene_lab').length),0);
    });
});

test('bulk Gene/Lab load failure or changed name cannot save an empty accidental selection',async()=>{
    await openPage('index',async page=>{
        await setupBulkGeneTest(page);
        await page.evaluate(async()=>{
            const original=window.__mockClient.from;
            window.__mockClient.from=table=>table==='generic_gene_lab'
                ? {select:()=>({eq:()=>({order:()=>({range:async()=>({data:null,error:{message:'read failed'}})})})})}
                :original(table);
            await onBulkGeneLabNameChange();
            await executeBulkGeneLabAdd();
        });
        assert.equal(await page.locator('#btn-save-bulk-gl').isDisabled(),true);
        assert.equal(await page.evaluate(()=>window.__geneCalls.length),0);
        assert.equal(await page.locator('#bulk-gl-error').isVisible(),true);
        await page.locator('#bulk-gl-test-name').fill('OTHER');
        assert.equal(await page.locator('#btn-save-bulk-gl').isDisabled(),true);
        assert.equal(await page.evaluate(()=>window.__writes.filter(w=>w.table==='generic_gene_lab').length),0);
    });
});

test('bulk Gene/Lab ignores late loads for a previous name',async()=>{
    await openPage('index',async page=>{
        await setupBulkGeneTest(page);
        await page.evaluate(async()=>{
            const original=window.__mockClient.from;
            window.__pendingGeneLoads={};
            window.__mockClient.from=table=>{
                if(table!=='generic_gene_lab')return original(table);
                let name;
                const q={select:()=>q,eq:(_,value)=>{name=value;return q;},order:()=>q,
                    range:()=>new Promise(resolve=>{window.__pendingGeneLoads[name]=resolve;})};
                return q;
            };
            document.getElementById('bulk-gl-test-name').value='FIRST';window.__firstLoad=onBulkGeneLabNameChange();
            document.getElementById('bulk-gl-test-name').value='SECOND';window.__secondLoad=onBulkGeneLabNameChange();
            window.__pendingGeneLoads.SECOND({data:[{id:22,generic_code:'G2',description:'Second'}],error:null});
            await window.__secondLoad;
            window.__pendingGeneLoads.FIRST({data:[{id:21,generic_code:'G1',description:'First'}],error:null});
            await window.__firstLoad;
            await executeBulkGeneLabAdd();
        });
        const args=await page.evaluate(()=>window.__geneCalls[0].args);
        assert.equal(args.p_test_name,'SECOND');
        assert.deepEqual(args.p_generic_codes,['G2']);
        assert.equal(args.p_expected_rows[0].id,22);
    });
});

test('bulk Gene/Lab paginates loaded links and never falls back to table writes on missing RPC',async()=>{
    await openPage('index',async page=>{
        await setupBulkGeneTest(page);
        await page.evaluate(async()=>{
            const original=window.__mockClient.from;
            const rows=Array.from({length:501},(_,i)=>({id:i+1,generic_code:`CODE${i}`,description:`Advice ${i}`}));
            window.__genePages=[];
            window.__mockClient.from=table=>table==='generic_gene_lab'
                ? {select:()=>({eq:()=>({order:()=>({range:async(first,last)=>{
                    window.__genePages.push(first);return {data:rows.slice(first,last+1),error:null};
                }})})})}:original(table);
            await onBulkGeneLabNameChange();
            window.__mockClient.rpc=async(name,args)=>{
                window.__geneCalls.push({name,args});return {data:null,error:{code:'PGRST202',message:'function missing'}};
            };
            await executeBulkGeneLabAdd();
        });
        assert.deepEqual(await page.evaluate(()=>window.__genePages),[0,500]);
        assert.equal(await page.evaluate(()=>window.__geneCalls[0].args.p_expected_rows.length),501);
        assert.equal(await page.evaluate(()=>window.__geneCalls[0].args.p_generic_codes.length),501);
        assert.equal(await page.locator('#bulk-gl-error').isVisible(),true);
        assert.equal(await page.evaluate(()=>window.__writes.filter(w=>w.table==='generic_gene_lab').length),0);
    });
});

async function setupDrugSaveTest(page) {
    await page.waitForFunction(()=>allDrugsRaw.length>0);
    await page.evaluate(()=>{
        openEditDrug(allDrugsRaw[0].drug_code);
        document.getElementById('form-drug-name').value='Edited name';
        document.getElementById('form-drug-tradename').value='Draft trade name';
        window.__drugCalls=[];
        window.__drugOutcome={data:allDrugsRaw[0].drug_code,error:null};
        const originalRPC=window.__mockClient.rpc;
        window.__mockClient.rpc=(name,args)=>{
            if(name!=='save_drug_with_tags')return originalRPC(name,args);
            window.__drugCalls.push({name,args:structuredClone(args)});
            if(window.__drugDeferred)return new Promise(resolve=>{window.__finishDrug=resolve;});
            if(window.__drugNetworkFailure)return Promise.reject(new Error('Network lost'));
            return Promise.resolve(window.__drugOutcome);
        };
    });
}

test('drug editor saves parent and tags through one RPC and retains failed form state',async()=>{
    await openPage('index',async page=>{
        await setupDrugSaveTest(page);
        await page.evaluate(async()=>{
            window.__drugOutcome={data:null,error:{message:'<img src=x onerror="window.__xss=1"> tag failure'}};
            await saveDrug();
        });
        const calls=await page.evaluate(()=>window.__drugCalls);
        assert.equal(calls.length,1);
        assert.equal(calls[0].name,'save_drug_with_tags');
        assert.equal(calls[0].args.p_drug_code,code);
        assert.equal(calls[0].args.p_is_edit,true);
        assert.equal(calls[0].args.p_drug_name,'Edited name');
        assert.equal(calls[0].args.p_trade_name,'Draft trade name');
        assert.deepEqual(calls[0].args.p_tag_names,[text]);
        assert.equal(await page.locator('#form-drug-name').inputValue(),'Edited name');
        assert.equal(await page.locator('#form-drug-tradename').inputValue(),'Draft trade name');
        assert.equal(await page.locator('input[name="drug-tags"]:checked').count(),1);
        assert.equal(await page.locator('#drug-save-error').isVisible(),true);
        assert.equal(await page.locator('#drug-save-error img').count(),0);
        assert.equal(await page.locator('#form-drug-code').isDisabled(),true);
        assert.equal(await page.locator('#drug-modal .btn-success').isDisabled(),false);
        assert.equal(await page.evaluate(()=>window.__writes.filter(w=>['drugs','drug_tag_mapping'].includes(w.table)).length),0);
        await page.evaluate(async()=>{
            window.__drugOutcome={data:allDrugsRaw[0].drug_code,error:null};await saveDrug();
        });
        assert.equal(await page.locator('#drug-modal').isVisible(),false);
    });
});

test('drug create preserves mode, prevents duplicate submissions and supports empty tags',async()=>{
    await openPage('index',async page=>{
        await setupDrugSaveTest(page);
        await page.evaluate(async()=>{
            openAddDrug();
            document.getElementById('form-drug-code').value='NEW_DRUG';
            document.getElementById('form-drug-name').value='New drug';
            window.__drugDeferred=true;
            window.__drugPromise=saveDrug();
            await saveDrug();
        });
        assert.equal(await page.evaluate(()=>window.__drugCalls.length),1);
        let call=await page.evaluate(()=>window.__drugCalls[0]);
        assert.equal(call.args.p_is_edit,false);
        assert.deepEqual(call.args.p_tag_names,[]);
        assert.equal(await page.locator('#form-drug-name').isDisabled(),true);
        assert.equal(await page.locator('#drug-modal .btn-success').isDisabled(),true);
        await page.evaluate(async()=>{
            window.__finishDrug({data:null,error:{code:'23505',message:'duplicate key'}});
            await window.__drugPromise;
        });
        assert.equal(await page.locator('#form-drug-code').inputValue(),'NEW_DRUG');
        assert.equal(await page.locator('#form-drug-code').isDisabled(),false);
        assert.equal(await page.locator('#drug-save-error').isVisible(),true);
        assert.equal(await page.locator('#drug-modal').isVisible(),true);
    });
});

test('drug editor handles missing RPC, lost response and missing-row errors without fallback or false success',async()=>{
    await openPage('index',async page=>{
        await setupDrugSaveTest(page);
        for(const mode of ['missing','network','removed','empty']){
            await page.evaluate(async mode=>{
                window.__drugNetworkFailure=mode==='network';
                window.__drugOutcome=mode==='missing'?{data:null,error:{code:'PGRST202',message:'function missing'}}
                    :mode==='removed'?{data:null,error:{code:'P0002',message:'drug no longer exists'}}:{data:null,error:null};
                await saveDrug();
            },mode);
            assert.equal(await page.locator('#drug-modal').isVisible(),true);
            assert.equal(await page.locator('#form-drug-name').inputValue(),'Edited name');
            assert.equal(await page.locator('input[name="drug-tags"]:checked').count(),1);
            assert.equal(await page.locator('#drug-modal .btn-success').isDisabled(),false);
            assert.equal(await page.locator('#drug-save-error').isVisible(),true);
        }
        assert.equal(await page.evaluate(()=>window.__writes.filter(w=>['drugs','drug_tag_mapping'].includes(w.table)).length),0);
    });
});

test('drug form validates required fields and cached duplicate codes before submitting',async()=>{
    await openPage('index',async page=>{
        await setupDrugSaveTest(page);
        await page.evaluate(async()=>{
            openAddDrug();await saveDrug();
            document.getElementById('form-drug-code').value='NEW_DRUG';await saveDrug();
            document.getElementById('form-drug-name').value='New drug';
            document.getElementById('form-drug-code').value=allDrugsRaw[0].drug_code;await saveDrug();
        });
        assert.equal(await page.evaluate(()=>window.__drugCalls.length),0);
        assert.equal(await page.locator('#drug-save-error').isVisible(),true);
        assert.equal(await page.locator('#drug-modal .btn-success').isDisabled(),false);
        assert.equal(await page.locator('#form-drug-code').isDisabled(),false);
    });
});

async function setupPharmSaveTest(page){
 await page.waitForFunction(()=>allDrugsRaw.length>0);
 await page.evaluate(()=>{
  allGenerics.push({generic_code:'G2',generic_name:'Generic B'},{generic_code:'G3',generic_name:'Generic C'});
  allPharmClasses=[{class_name:'A'},{class_name:'B'},{class_name:'C'}];
  window.__fixtures.generic_pharm_mapping=[{generic_code:'G1',class_name:'A'},{generic_code:'G1',class_name:'B'},{generic_code:'G2',class_name:'A'}];
  window.__pharmCalls=[];window.__pharmPages=[];
  const originalFrom=window.__mockClient.from;
  window.__mockClient.from=table=>{
   const q=originalFrom(table);if(table!=='generic_pharm_mapping')return q;
   let filterColumn,filterValue;
   q.eq=(column,value)=>{filterColumn=column;filterValue=value;return q;};
   q.range=(first,last)=>{
    window.__pharmPages.push({filterColumn,filterValue,first});
    if(window.__pharmDeferredReads)return new Promise(resolve=>{window.__pharmReadResolvers[filterValue]=resolve;});
    if(window.__pharmReadError)return Promise.resolve({data:null,error:{message:'mapping read failed'}});
    return Promise.resolve({data:window.__fixtures.generic_pharm_mapping.filter(r=>r[filterColumn]===filterValue).slice(first,last+1),error:null});
   };
   return q;
  };
  const originalRPC=window.__mockClient.rpc;
  window.__mockClient.rpc=(name,args)=>{
   if(!['save_generic_with_pharm','save_pharm_class_links'].includes(name))return originalRPC(name,args);
   window.__pharmCalls.push({name,args:structuredClone(args)});
   if(window.__pharmRpcDeferred)return new Promise(resolve=>{window.__finishPharm=resolve;});
   if(window.__pharmRpcNetwork)return Promise.reject(new Error('Network lost'));
   if(window.__pharmRpcError)return Promise.resolve({data:null,error:window.__pharmRpcError});
   return Promise.resolve({data:name==='save_generic_with_pharm'?args.p_generic_code:args.p_generic_codes.length,error:null});
  };
 });
}

test('generic save uses freshly loaded classes and one RPC, retaining failed fields and alert flags',async()=>{
 await openPage('index',async page=>{
  await setupPharmSaveTest(page);
  await page.evaluate(async()=>{
   await openEditGeneric('G1');
   document.getElementById('master-gen-name').value='Edited generic';
   document.getElementById('master-gen-note').value='Draft note';
   document.getElementById('master-gen-hepatic').checked=false;
   window.__pharmRpcError={message:'<img src=x onerror="window.__xss=1"> class insert failed'};
   await saveMasterGeneric();
  });
  const call=await page.evaluate(()=>window.__pharmCalls[0]);
  assert.equal(call.name,'save_generic_with_pharm');
  assert.equal(call.args.p_is_edit,true);
  assert.deepEqual(call.args.p_class_names,['A','B']);
  assert.deepEqual(call.args.p_expected_classes,['A','B']);
  assert.equal(call.args.p_needs_renal_adj,true);assert.equal(call.args.p_needs_hepatic_adj,false);
  assert.equal(await page.locator('#master-gen-name').inputValue(),'Edited generic');
  assert.equal(await page.locator('#master-gen-note').inputValue(),'Draft note');
  assert.equal(await page.locator('#master-gen-code').isDisabled(),true);
  assert.equal(await page.locator('#btn-save-generic').isDisabled(),false);
  assert.equal(await page.locator('#generic-save-error').isVisible(),true);
  assert.equal(await page.locator('#generic-save-error img').count(),0);
  assert.equal(await page.evaluate(()=>window.__writes.filter(w=>['generics','generic_pharm_mapping'].includes(w.table)).length),0);
  await page.evaluate(async()=>{window.__pharmRpcError=null;await saveMasterGeneric();});
  assert.equal(await page.locator('#master-gen-name').inputValue(),'');
  assert.equal(await page.locator('#master-gen-code').isDisabled(),false);
  assert.deepEqual(await page.evaluate(()=>activePharmTags),[]);
 });
});

test('generic class reads must succeed before saving; network and stale errors preserve the draft',async()=>{
 await openPage('index',async page=>{
  await setupPharmSaveTest(page);
  await page.evaluate(async()=>{window.__pharmReadError=true;await openEditGeneric('G1');await saveMasterGeneric();});
  assert.equal(await page.locator('#btn-save-generic').isDisabled(),true);
  assert.equal(await page.evaluate(()=>window.__pharmCalls.length),0);
  await page.evaluate(async()=>{
   window.__pharmReadError=false;await reloadGenericPharm();
   document.getElementById('master-gen-note').value='Keep this';
   window.__pharmRpcNetwork=true;await saveMasterGeneric();
  });
  assert.equal(await page.locator('#master-gen-note').inputValue(),'Keep this');
  assert.deepEqual(await page.evaluate(()=>activePharmTags),['A','B']);
  await page.evaluate(async()=>{window.__pharmRpcNetwork=false;window.__pharmRpcError={code:'40001',message:'changed'};await saveMasterGeneric();});
  assert.equal(await page.locator('#btn-save-generic').isDisabled(),true);
  assert.equal(await page.locator('#master-gen-note').inputValue(),'Keep this');
  assert.match(await page.locator('#generic-save-error').innerText(),/ถูกเปลี่ยนหลังโหลด/);
 });
});

test('generic create captures mode before locking, blocks duplicate submits and restores failed forms',async()=>{
 await openPage('index',async page=>{
  await setupPharmSaveTest(page);
  await page.evaluate(async()=>{
   resetGenericForm();openModal('generic-master-modal');
   document.getElementById('master-gen-code').value='NEW';document.getElementById('master-gen-name').value='New generic';
   window.__pharmRpcDeferred=true;window.__genericPending=saveMasterGeneric();await saveMasterGeneric();
  });
  assert.equal(await page.evaluate(()=>window.__pharmCalls.length),1);
  const args=await page.evaluate(()=>window.__pharmCalls[0].args);
  assert.equal(args.p_is_edit,false);assert.deepEqual(args.p_expected_classes,[]);
  assert.equal(await page.locator('#master-gen-name').isDisabled(),true);
  await page.evaluate(async()=>{window.__finishPharm({data:null,error:{code:'23505',message:'duplicate'}});await window.__genericPending;});
  assert.equal(await page.locator('#master-gen-code').inputValue(),'NEW');
  assert.equal(await page.locator('#master-gen-code').isDisabled(),false);
  assert.equal(await page.locator('#generic-save-error').isVisible(),true);
 });
});

test('bulk pharmacology uses authoritative membership and one RPC without separate delete/insert writes',async()=>{
 await openPage('index',async page=>{
  await setupPharmSaveTest(page);
  await page.evaluate(()=>openBulkPharmModal());
  assert.equal(await page.locator('.bulk-pharm-gen-cb:checked').count(),2);
  await page.locator('.bulk-pharm-gen-cb[value="G2"]').uncheck();
  await page.locator('.bulk-pharm-gen-cb[value="G3"]').check();
  await page.evaluate(async()=>{window.__pharmRpcError={message:'insert failed'};await executeBulkPharmAdd();});
  const call=await page.evaluate(()=>window.__pharmCalls[0]);
  assert.equal(call.name,'save_pharm_class_links');
  assert.deepEqual(call.args.p_expected_codes,['G1','G2']);
  assert.deepEqual(call.args.p_generic_codes.sort(),['G1','G3']);
  assert.equal(await page.locator('.bulk-pharm-gen-cb:checked').count(),2);
  assert.equal(await page.locator('#bulk-pharm-modal').isVisible(),true);
  assert.equal(await page.locator('#bulk-pharm-error').isVisible(),true);
  assert.equal(await page.evaluate(()=>window.__writes.filter(w=>w.table==='generic_pharm_mapping').length),0);
  await page.evaluate(async()=>{window.__pharmRpcError=null;await executeBulkPharmAdd();});
  assert.equal(await page.locator('#bulk-pharm-modal').isVisible(),false);
 });
});

test('bulk pharmacology blocks failed/stale loads, confirms clearing and prevents duplicate submission',async()=>{
 await openPage('index',async page=>{
  await setupPharmSaveTest(page);
  await page.evaluate(async()=>{window.__pharmReadError=true;await openBulkPharmModal();await executeBulkPharmAdd();});
  assert.equal(await page.evaluate(()=>window.__pharmCalls.length),0);
  assert.equal(await page.locator('#btn-save-bulk-pharm').isDisabled(),true);
  await page.evaluate(async()=>{window.__pharmReadError=false;await onBulkPharmClassChange();bulkPharmSelectedGenerics.clear();await executeBulkPharmAdd();});
  assert.equal(await page.evaluate(()=>window.__pharmCalls.length),0); // confirmation dismissed
  page.removeAllListeners('dialog');page.on('dialog',dialog=>dialog.accept());
  await page.evaluate(async()=>{window.__pharmRpcDeferred=true;window.__bulkPharmPending=executeBulkPharmAdd();await executeBulkPharmAdd();});
  assert.equal(await page.evaluate(()=>window.__pharmCalls.length),1);
  assert.equal(await page.locator('#btn-save-bulk-pharm').isDisabled(),true);
  await page.evaluate(async()=>{window.__finishPharm({data:null,error:{code:'40001',message:'changed'}});await window.__bulkPharmPending;});
  assert.equal(await page.locator('#btn-save-bulk-pharm').isDisabled(),true);
  assert.match(await page.locator('#bulk-pharm-error').innerText(),/ถูกเปลี่ยนหลังโหลด/);
 });
});

test('bulk pharmacology ignores late class loads and paginates snapshots before saving',async()=>{
 await openPage('index',async page=>{
  await setupPharmSaveTest(page);
  await page.evaluate(async()=>{
   await openBulkPharmModal();window.__pharmDeferredReads=true;window.__pharmReadResolvers={};
   document.getElementById('bulk-pharm-select').value='A';window.__classA=onBulkPharmClassChange();
   document.getElementById('bulk-pharm-select').value='B';window.__classB=onBulkPharmClassChange();
   window.__pharmReadResolvers.B({data:[{generic_code:'G3'}],error:null});await window.__classB;
   window.__pharmReadResolvers.A({data:[{generic_code:'G1'}],error:null});await window.__classA;
   await executeBulkPharmAdd();
  });
  let args=await page.evaluate(()=>window.__pharmCalls[0].args);
  assert.equal(args.p_class_name,'B');assert.deepEqual(args.p_expected_codes,['G3']);
  await page.evaluate(async()=>{
   window.__pharmDeferredReads=false;window.__pharmPages=[];
   window.__fixtures.generic_pharm_mapping=Array.from({length:501},(_,i)=>({generic_code:`X${i}`,class_name:'A'}));
   await openBulkPharmModal();
   window.__pharmRpcError={code:'PGRST202',message:'missing RPC'};await executeBulkPharmAdd();
  });
  args=await page.evaluate(()=>window.__pharmCalls[1].args);
  assert.equal(args.p_expected_codes.length,501);assert.equal(args.p_generic_codes.length,501);
  assert.deepEqual(await page.evaluate(()=>window.__pharmPages.map(x=>x.first)),[0,500]);
  assert.equal(await page.locator('#bulk-pharm-error').isVisible(),true);
  assert.equal(await page.evaluate(()=>window.__writes.filter(w=>w.table==='generic_pharm_mapping').length),0);
 });
});

test('inline adult renal gate clears results and highlights for children, including manual Lab values', async () => {
    await openPage('index', async page => {
        await page.waitForSelector('.drug-card');
        const result = await page.evaluate(async code => {
            window.__fixtures.generic_adjustments = ['CrCl', 'eGFR'].map(criterion_type => ({
                generic_code: 'G1', adj_type: 'renal', criterion_type, min_value: 0, max_value: 1000, recommendation: 'Reference'
            }));
            await toggleInlineAdj(code);
            const get = prefix => document.getElementById(`${prefix}-${code}`);
            const snapshot = () => ({
                values: ['result-crcl', 'result-egfr', 'result-abs-gfr'].map(id => get(id).innerText),
                highlights: [...document.getElementById(`inline-adj-container-${code}`).querySelectorAll('tr')].filter(row => row.style.backgroundColor).length,
                warning: get('dynamic-warning').innerText,
                border: get('dynamic-warning').style.border,
                manual: get('manual-egfr').value
            });
            get('calc-age').value = '60'; get('calc-wt').value = '70'; get('calc-ht').value = '170'; get('calc-scr').value = '1';
            calculateInlineCrCl(code);
            const adult = snapshot();
            get('calc-age').value = '8';
            get('calc-age').dispatchEvent(new Event('input', { bubbles: true }));
            const child = snapshot();
            get('manual-egfr').value = '45';
            get('manual-egfr').dispatchEvent(new Event('input', { bubbles: true }));
            const childManual = snapshot();
            const blockedAges = ['0', '17.99', '-1'].map(age => {
                get('calc-age').value = age; calculateInlineCrCl(code); return snapshot();
            });
            get('calc-age').value = '18'; get('manual-egfr').value = ''; calculateInlineCrCl(code);
            const eighteen = snapshot();
            clearInlineCrCl(code);
            const cleared = snapshot();
            return { adult, child, childManual, blockedAges, eighteen, cleared };
        }, code);
        assert.equal(result.adult.highlights, 2);
        assert.ok(result.adult.values.every(value => value !== '-'));
        for (const state of [result.child, result.childManual, ...result.blockedAges]) {
            assert.deepEqual(state.values, ['-', '-', '-']);
            assert.equal(state.highlights, 0);
            assert.ok(state.warning.includes('⚠️'));
            assert.ok(state.border.includes('2px'));
        }
        assert.ok(result.child.warning.includes('18'));
        assert.ok(result.childManual.warning.includes('Lab'));
        assert.equal(result.childManual.manual, '45', 'retain the entered Lab value as a draft');
        assert.equal(result.eighteen.highlights, 2);
        assert.ok(result.eighteen.values.every(value => value !== '-'));
        assert.ok(!result.eighteen.warning.includes('อายุต่ำกว่า'));
        assert.deepEqual(result.cleared.values, ['-', '-', '-']);
        assert.equal(result.cleared.highlights, 0);
        assert.ok(!result.cleared.warning.includes('อายุต่ำกว่า'));
    });
});

test('modal adult renal gate blocks pediatric results and removes stale highlights on input', async () => {
    await openPage('index', async page => {
        await page.waitForSelector('.drug-card');
        const result = await page.evaluate(async code => {
            await openAdjustmentModal(code);
            renderAdjustments([{ generic_code: 'G1', criterion_type: 'CrCl', adj_type: 'renal', min_value: 0, max_value: 1000, recommendation: 'Reference' }], allDrugsRaw[0].drug_contents);
            document.getElementById('calc-weight').value = '70';
            document.getElementById('calc-scr').value = '1';
            const snapshot = () => ({ value: document.getElementById('result-crcl').innerText,
                highlights: [...document.querySelectorAll('#adjustment-modal .crcl-row')].filter(row => row.style.backgroundColor).length,
                warning: document.getElementById('modal-adjustment-warning').innerText });
            const states = ['60', '8', '17.99', '0', '-1', '18'].map(age => {
                const input = document.getElementById('calc-age'); input.value = age;
                input.dispatchEvent(new Event('input', { bubbles: true })); return snapshot();
            });
            clearCrClCalc(); return { states, cleared: snapshot() };
        }, code);
        for (const index of [0, 5]) {
            assert.equal(result.states[index].highlights, 1);
            assert.notEqual(result.states[index].value, '-');
        }
        for (const state of result.states.slice(1, 5)) {
            assert.equal(state.value, '-'); assert.equal(state.highlights, 0); assert.ok(state.warning.includes('⚠️'));
        }
        assert.equal(result.cleared.value, '-'); assert.equal(result.cleared.highlights, 0);
        assert.ok(!result.cleared.warning.includes('อายุต่ำกว่า'));
    });
});

async function setupDeferredDrugCardRefresh(page) {
    await setupDrugSaveTest(page);
    await page.evaluate(() => {
        const other = structuredClone(allDrugsRaw[0]); other.drug_code = 'OTHER';
        allDrugsRaw.push(other); renderDrugs(allDrugsRaw);
        const originalFrom = window.__mockClient.from;
        window.__mockClient.from = table => {
            const q = originalFrom(table);
            if (table === 'drugs') q.then = (yes, no) => new Promise(resolve => { window.__finishCardRefresh = resolve; }).then(yes, no);
            return q;
        };
        window.__cardSavePromise = saveDrug();
    });
    await page.waitForFunction(() => Boolean(window.__finishCardRefresh));
}

test('edited drug card shows refresh status until the latest data arrives, even across rerenders', async () => {
    await openPage('index', async page => {
        await setupDeferredDrugCardRefresh(page);
        assert.equal(await page.locator('#drug-modal').isVisible(), false);
        assert.equal(await page.locator('.drug-card[aria-busy="true"]').count(), 1);
        assert.equal(await page.locator('.drug-card-refresh-status').count(), 1);
        assert.ok((await page.locator('.drug-card-refresh-status').innerText()).includes('บันทึกสำเร็จแล้ว กำลังโหลดข้อมูลล่าสุด'));
        await page.evaluate(() => renderDrugs(allDrugsRaw));
        assert.equal(await page.locator('.drug-card[aria-busy="true"]').count(), 1);
        await page.evaluate(async () => {
            const updated = structuredClone(window.__fixtures.drugs);
            updated[0].trade_name = 'Latest saved trade name';
            window.__finishCardRefresh({ data: updated, error: null });
            await window.__cardSavePromise;
        });
        assert.equal(await page.locator('.drug-card-refresh-status').count(), 0);
        assert.equal(await page.locator('.drug-card[aria-busy="true"]').count(), 0);
        assert.ok((await page.locator('.drug-card').innerText()).includes('Latest saved trade name'));
    });
});

test('failed card refresh distinguishes successful save from stale card and allows read-only retry', async () => {
    await openPage('index', async page => {
        await setupDeferredDrugCardRefresh(page);
        await page.evaluate(async () => {
            window.__finishCardRefresh({ data: null, error: { message: 'Network error' } });
            await window.__cardSavePromise;
        });
        assert.equal(await page.locator('.drug-card').count(), 2, 'keep visible cards when refresh fails');
        assert.equal(await page.locator('.drug-card[aria-busy="true"]').count(), 0);
        assert.ok((await page.locator('.drug-card-refresh-status').innerText()).includes('ข้อมูลในการ์ดนี้อาจยังเป็นข้อมูลเดิม'));
        assert.equal(await page.evaluate(() => window.__drugCalls.length), 1);
        await page.evaluate(() => { window.__finishCardRefresh = null; });
        await page.locator('.drug-card-refresh-status button').click();
        await page.waitForFunction(() => Boolean(window.__finishCardRefresh));
        assert.equal(await page.locator('.drug-card[aria-busy="true"]').count(), 1);
        await page.evaluate(() => window.__finishCardRefresh({ data: structuredClone(window.__fixtures.drugs), error: null }));
        await page.waitForFunction(() => !document.querySelector('.drug-card-refresh-status'));
        assert.equal(await page.evaluate(() => window.__drugCalls.length), 1, 'retry refresh must not repeat saving');
    });
});

const cardManagerCases = [
    'saveMeKnowledge', 'deleteMeRule', 'saveLink', 'deleteLink', 'saveGenericLink', 'deleteGenericLink',
    'saveDrugImages', 'addAlias', 'removeAlias', 'addLabelMapping', 'removeLabelMapping',
    'addNlemMapping', 'removeNlemMapping', 'addAdministration', 'removeAdmin', 'moveAdminRank',
    'addIngredient', 'removeIngredient', 'removeAllIngredients', 'saveNutriConfig', 'deleteNutriConfig', 'deleteDrug',
    'executeBulkNlemAdd', 'executeBulkCopyAdmin', 'executeAliasBulkCopy'
];
for (const action of cardManagerCases) {
    test(`card manager refresh status: ${action}`, async () => {
        await openPage('index', async page => {
            await page.waitForSelector('.drug-card');
            page.removeAllListeners('dialog'); page.on('dialog', dialog => dialog.accept());
            await page.evaluate(({ code, action }) => {
                const other = structuredClone(allDrugsRaw[0]); other.drug_code = 'OTHER';
                const unrelated = structuredClone(other); unrelated.drug_code = 'UNRELATED'; unrelated.drug_contents = [];
                allDrugsRaw.push(other, unrelated); renderDrugs(allDrugsRaw);
                const set = (id, value) => { document.getElementById(id).value = value; };
                for (const id of ['me-admin-drug-code', 'image-admin-drug-code', 'alias-admin-drug-code',
                    'target-label-drug-code', 'target-nlem-drug-code', 'target-admin-drug-code', 'target-drug-code', 'nutri-admin-code']) set(id, code);
                set('me-admin-type', 'Test risk'); set('me-admin-desc', 'Test description');
                set('link-admin-mode', action.includes('GenericLink') ? 'generic' : 'drug');
                set('link-admin-code', action.includes('GenericLink') ? 'G1' : code);
                set('link-admin-title-input', 'Reference'); set('link-admin-url-input', 'https://example.test/');
                set('alias-admin-input', 'New alias');
                setHTML(document.getElementById('select-generic'), '<option value="G1">Generic</option>');
                setHTML(document.getElementById('select-mapping-label'), '<option value="L1">Label</option>');
                set('nutri-admin-type', 'liquid'); set('nutri-admin-liquid-vol', '250'); set('nutri-admin-liquid-kcal', '250');
                currentIngredientsList = [{ generic_code: 'G1' }];
                currentAdminsList = [{ id: 1, route_code: 'R1', instructions: 'Use', rank: 1 }, { id: 2, route_code: 'R1', rank: 2 }];
                set('bulk-copy-admin-id', '1');
                set('alias-bulk-source-code', code);
                setHTML(document.getElementById('alias-bulk-copy-selection'), '<option value="New alias">New alias</option>');
                for (const name of ['bulk-target-drugs', 'alias-bulk-target-drugs', 'bulk-nlem-drug-cb']) {
                    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.name = name; checkbox.className = name; checkbox.value = 'OTHER'; checkbox.checked = true; document.body.append(checkbox);
                }
                window.__mockClient.rpc = async () => ({ data: 123, error: null });
                const originalFrom = window.__mockClient.from;
                window.__mockClient.from = table => {
                    const q = originalFrom(table), originalThen = q.then;
                    q.then = (yes, no) => {
                        if (table === 'drugs' && q.operation === 'select') return new Promise(resolve => { window.__finishManagerRefresh = resolve; }).then(yes, no);
                        if (table === 'drug_contents' && q.operation !== 'select') return Promise.resolve({ data: { drug_code: code, generic_code: 'G1' }, error: null }).then(yes, no);
                        return originalThen(yes, no);
                    };
                    return q;
                };
                const calls = {
                    deleteMeRule: () => deleteMeRule(1, code), deleteLink: () => deleteLink(1, 'drug', code),
                    saveGenericLink: () => saveLink(), deleteGenericLink: () => deleteLink(1, 'generic', 'G1'),
                    removeAlias: () => removeAlias(1, code), removeLabelMapping: () => removeLabelMapping(code, 'L1'),
                    removeNlemMapping: () => removeNlemMapping(code, 'N1'), removeAdmin: () => removeAdmin(1, code),
                    moveAdminRank: () => moveAdminRank(1, 1, code), removeIngredient: () => removeIngredient(code, 'G1'),
                    deleteDrug: () => deleteDrug(code)
                };
                window.__managerAction = calls[action] ? calls[action]() : window[action]();
            }, { code, action });
            await page.waitForFunction(() => Boolean(window.__finishManagerRefresh));
            const expected = action.includes('GenericLink') ? [code, 'OTHER'] : action.startsWith('execute') ? ['OTHER'] : [code];
            assert.deepEqual(await page.locator('.drug-card[aria-busy="true"]').evaluateAll(cards => cards.map(card => card.dataset.code)), expected);
            assert.equal(await page.locator('.drug-card-refresh-status').count(), expected.length);
            await page.evaluate(() => renderDrugs(allDrugsRaw));
            assert.equal(await page.locator('.drug-card[aria-busy="true"]').count(), expected.length);
            await page.evaluate(async action => {
                const data = structuredClone(window.__fixtures.drugs);
                window.__finishManagerRefresh({ data: action === 'deleteDrug' ? [] : data, error: null });
                await window.__managerAction;
            }, action);
            await page.waitForFunction(() => !document.querySelector('.drug-card-refresh-status'));
        });
    });
}

async function setupComparePrepTest(page) {
    await page.waitForFunction(() => allEnteralDrugs.length > 0);
    await page.evaluate(() => {
        document.querySelector('.product-cb').checked = true; renderTable();
        const originalFrom = window.__mockClient.from;
        window.__mockClient.from = table => {
            const q = originalFrom(table);
            if (table === 'nutrition_configs') q.then = (yes, no) => {
                if (window.__prepDeferred) return new Promise(resolve => { window.__finishPrep = resolve; }).then(yes, no);
                if (window.__prepError) return Promise.resolve({ data: null, error: { message: '<b>Denied</b>' } }).then(yes, no);
                const last = window.__writes.filter(w => w.table === table).at(-1);
                return Promise.resolve({ data: q.operation === 'delete' ? [{ drug_code: allEnteralDrugs[0].drug_code }] : structuredClone(last.payload), error: null }).then(yes, no);
            };
            return q;
        };
    });
}

test('compare preparation button opens existing setup, saves powder, and immediately updates calculator', async () => {
    await openPage('enteral_compare', async page => {
        await setupComparePrepTest(page);
        await page.getByRole('button', { name: '🍼 ตั้งค่าชง', exact: true }).click();
        assert.equal(await page.locator('#nutri-admin-modal').isVisible(), true);
        assert.equal(await page.locator('#nutri-admin-g-serve').inputValue(), '25');
        await page.evaluate(async () => {
            document.getElementById('nutri-admin-scoops').value = '4';
            document.getElementById('nutri-admin-g-serve').value = '40';
            document.getElementById('nutri-admin-protein').value = '0';
            await saveNutriConfig();
            openNutriCalc(allEnteralDrugs[0].drug_code);
        });
        const write = await page.evaluate(() => window.__writes.filter(w => w.table === 'nutrition_configs').at(-1));
        assert.equal(write.payload.grams_per_scoop, 10);
        assert.equal(write.payload.scoops_per_serving, 4);
        assert.equal(write.payload.protein_per_serving, 0);
        assert.equal(await page.locator('#nutri-admin-modal').isVisible(), false);
        assert.equal(await page.evaluate(() => activeNutriConfig.grams_per_scoop), 10);
        await page.evaluate(() => { document.getElementById('nutri-calc-modal').style.display = 'none'; openNutriAdmin(allEnteralDrugs[0].drug_code); });
        assert.equal(await page.locator('#nutri-admin-protein').inputValue(), '0');
    });
});

test('compare preparation supports unconfigured products, preserves failed drafts, blocks invalid and duplicate saves, and deletes', async () => {
    await openPage('enteral_compare', async page => {
        await setupComparePrepTest(page);
        await page.evaluate(() => {
            allEnteralDrugs[0].nutrition_configs = null; renderTable(); openNutriAdmin(allEnteralDrugs[0].drug_code);
            document.getElementById('nutri-admin-scoops').value = '0';
        });
        assert.equal(await page.getByRole('button', { name: '🍼 คำนวณชงอาหาร', exact: true }).count(), 0);
        await page.evaluate(() => saveNutriConfig());
        assert.equal(await page.evaluate(() => window.__writes.filter(w => w.table === 'nutrition_configs').length), 0);
        await page.evaluate(async () => {
            document.getElementById('nutri-admin-type').value = 'liquid'; toggleNutriAdminType();
            document.getElementById('nutri-admin-liquid-vol').value = '250';
            document.getElementById('nutri-admin-liquid-kcal').value = '300';
            window.__prepError = true; await saveNutriConfig();
        });
        assert.equal(await page.locator('#nutri-admin-modal').isVisible(), true);
        assert.equal(await page.locator('#nutri-admin-liquid-kcal').inputValue(), '300');
        assert.equal(await page.locator('#nutri-config-error b').count(), 0);
        assert.equal(await page.locator('#nutri-config-error').isVisible(), true);
        await page.evaluate(async () => {
            window.__prepError = false; window.__prepDeferred = true;
            window.__prepPromise = saveNutriConfig(); await saveNutriConfig();
        });
        assert.equal(await page.evaluate(() => window.__writes.filter(w => w.table === 'nutrition_configs').length), 2);
        assert.equal(await page.locator('#nutri-admin-modal .btn-success').isDisabled(), true);
        await page.evaluate(async () => {
            const payload = window.__writes.filter(w => w.table === 'nutrition_configs').at(-1).payload;
            window.__finishPrep({ data: structuredClone(payload), error: null }); await window.__prepPromise; window.__prepDeferred = false;
        });
        assert.equal(await page.getByRole('button', { name: '🍼 คำนวณชงอาหาร', exact: true }).count(), 1);
        assert.equal(await page.evaluate(() => allEnteralDrugs[0].nutrition_configs.grams_per_scoop), null);
        page.removeAllListeners('dialog'); page.on('dialog', dialog => dialog.accept());
        await page.evaluate(async () => { openNutriAdmin(allEnteralDrugs[0].drug_code); await deleteNutriConfig(); });
        assert.equal(await page.getByRole('button', { name: '🍼 คำนวณชงอาหาร', exact: true }).count(), 0);
        assert.equal(await page.getByRole('button', { name: '🍼 ตั้งค่าชง', exact: true }).count(), 1);
    });
});

test('compare preparation controls are unavailable to unsigned users', async () => {
    await openPage('enteral_compare', async page => {
        await setupComparePrepTest(page);
        await page.evaluate(async () => { isAdmin = false; renderTable(); openNutriAdmin(allEnteralDrugs[0].drug_code); await saveNutriConfig(); });
        assert.equal(await page.getByRole('button', { name: '🍼 ตั้งค่าชง', exact: true }).count(), 0);
        assert.equal(await page.locator('#nutri-admin-modal').isVisible(), false);
        assert.equal(await page.evaluate(() => window.__writes.filter(w => w.table === 'nutrition_configs').length), 0);
    });
});

async function setupPaginatedEnteralTest(page, failFrom = null) {
    await page.waitForFunction(() => allEnteralDrugs.length > 0);
    await page.evaluate(failFrom => {
        window.__enteralPages = [];
        window.__enteralOriginal = structuredClone(allEnteralDrugs);
        const rows = Array.from({ length: 1100 }, (_, i) => ({
            drug_code: `D${String(i).padStart(5, '0')}`, drug_name: 'Same product name',
            drug_type: i < 7 || i >= 1066 ? 'enteral nutrition' : 'drug', is_active: true,
            nutrition_configs: i === 995 ? { product_type: 'powder' } : i === 996 ? [{ product_type: 'liquid' }] : []
        }));
        rows.push({ drug_code: 'INACTIVE', drug_name: 'Inactive food', drug_type: 'enteral nutrition', is_active: false });
        const originalFrom = window.__mockClient.from;
        window.__mockClient.from = table => {
            if (table !== 'drugs') return originalFrom(table);
            const query = { first: 0, last: 999, filters: [], ordering: [] };
            query.select = () => query;
            query.eq = (key, value) => { query.filters.push([key, value]); return query; };
            query.order = (key, options) => { query.ordering.push({ key, options }); return query; };
            query.range = (first, last) => { query.first = first; query.last = last; return query; };
            query.then = (yes, no) => {
                window.__enteralPages.push({ first: query.first, last: query.last, ordering: query.ordering });
                if (query.first === failFrom) return Promise.resolve({ data: null, error: { message: 'Later page unavailable' } }).then(yes, no);
                let data = [...rows].reverse().filter(row => query.filters.every(([key, value]) => row[key] === value));
                for (const { key } of query.ordering) data.sort((a, b) => String(a[key]).localeCompare(String(b[key])));
                // Simulate a server cap smaller than the requested page size.
                data = data.slice(query.first, Math.min(query.last + 1, query.first + 200));
                return Promise.resolve({ data, error: null }).then(yes, no);
            };
            return query;
        };
    }, failFrom);
}

test('enteral comparison loads every page before filtering, including unconfigured food beyond row 1000', async () => {
    await openPage('enteral_compare', async page => {
        await setupPaginatedEnteralTest(page);
        const result = await page.evaluate(async () => {
            await fetchEnteralDrugs(); renderSelectors();
            return { codes: allEnteralDrugs.map(d => d.drug_code), pages: window.__enteralPages };
        });
        assert.equal(result.codes.length, 43);
        assert.ok(result.codes.includes('D01099'));
        assert.ok(result.codes.includes('D00995') && result.codes.includes('D00996'), 'preserve config-only products');
        assert.ok(!result.codes.includes('INACTIVE'));
        assert.equal(new Set(result.codes).size, 43);
        assert.equal(await page.locator('.product-cb').count(), 43);
        assert.deepEqual(result.pages.map(p => p.first), [0, 200, 400, 600, 800, 1000, 1100]);
        assert.ok(result.pages.every(p => p.last === p.first + 499));
        assert.ok(result.pages.every(p => p.ordering.length === 1 && p.ordering[0].key === 'drug_code' && p.ordering[0].options.ascending));
    });
});

test('a failed later enteral page cannot replace the catalog with a partial list', async () => {
    await openPage('enteral_compare', async page => {
        await setupPaginatedEnteralTest(page, 200);
        const result = await page.evaluate(async () => {
            let error;
            try { await fetchEnteralDrugs(); } catch (e) { error = e.message; }
            return { error, current: allEnteralDrugs, original: window.__enteralOriginal, pages: window.__enteralPages.length };
        });
        assert.equal(result.error, 'Later page unavailable');
        assert.deepEqual(result.current, result.original);
        assert.equal(result.pages, 2);
    });
});

for (const file of ['index', 'enteral_compare']) {
    test(`${file}: preparation editor blocks invalid fields and retains explicit zero and blank macros`, async () => {
        await openPage(file, async page => {
            await page.waitForFunction(() => typeof allEnteralDrugs !== 'undefined' ? allEnteralDrugs.length > 0 : allDrugsRaw.length > 0);
            const result = await page.evaluate(async () => {
                const catalog = typeof allEnteralDrugs !== 'undefined' ? allEnteralDrugs : allDrugsRaw;
                const code = catalog[0].drug_code; openNutriAdmin(code, 'Test');
                const counts = [];
                for (const id of ['nutri-admin-scoops', 'nutri-admin-g-serve', 'nutri-admin-powder-vol', 'nutri-admin-powder-kcal']) {
                    const previous = document.getElementById(id).value;
                    for (const value of ['0', '-1', '', '1e309']) {
                        document.getElementById(id).value = value; await saveNutriConfig();
                        counts.push(window.__writes.filter(w => w.table === 'nutrition_configs').length);
                    }
                    document.getElementById(id).value = previous;
                }
                for (const id of ['nutri-admin-protein', 'nutri-admin-carb', 'nutri-admin-fat']) {
                    document.getElementById(id).value = '-1'; await saveNutriConfig();
                    counts.push(window.__writes.filter(w => w.table === 'nutrition_configs').length);
                    document.getElementById(id).value = '';
                }
                const retained = document.getElementById('nutri-admin-modal').style.display === 'block';
                const errorVisible = !document.getElementById('nutri-config-error').hidden;
                const originalFrom = window.__mockClient.from;
                window.__mockClient.from = table => {
                    const q = originalFrom(table);
                    if (table === 'nutrition_configs') q.then = (yes, no) => Promise.resolve({ data: structuredClone(window.__writes.filter(w => w.table === table).at(-1).payload), error: null }).then(yes, no);
                    return q;
                };
                document.getElementById('nutri-admin-scoops').value = '5';
                document.getElementById('nutri-admin-g-serve').value = '25';
                document.getElementById('nutri-admin-protein').value = '0';
                document.getElementById('nutri-admin-carb').value = '';
                document.getElementById('nutri-admin-fat').value = '2.5';
                await saveNutriConfig();
                const writes = window.__writes.filter(w => w.table === 'nutrition_configs');
                return { counts, retained, errorVisible, writes };
            });
            assert.ok(result.counts.every(count => count === 0));
            assert.equal(result.retained, true); assert.equal(result.errorVisible, true);
            assert.equal(result.writes.length, 1);
            assert.equal(result.writes[0].payload.grams_per_scoop, 5);
            assert.equal(result.writes[0].payload.protein_per_serving, 0);
            assert.equal(result.writes[0].payload.carb_per_serving, null);
            assert.equal(result.writes[0].payload.fat_per_serving, 2.5);
        });
    });

    test(`${file}: calculator rejects invalid legacy powder settings and clears stale results`, async () => {
        await openPage(file, async page => {
            await page.waitForFunction(() => typeof allEnteralDrugs !== 'undefined' ? allEnteralDrugs.length > 0 : allDrugsRaw.length > 0);
            const result = await page.evaluate(() => {
                const catalog = typeof allEnteralDrugs !== 'undefined' ? allEnteralDrugs : allDrugsRaw;
                const valid = { product_type: 'powder', serving_volume_ml: 250, serving_kcal: 250, scoops_per_serving: 5, grams_per_scoop: 5, protein_per_serving: 0, carb_per_serving: null, fat_per_serving: 1 };
                catalog[0].nutrition_configs = { ...valid }; openNutriCalc(catalog[0].drug_code);
                document.getElementById('nutri-calc-volume').value = '250'; runNutriCalc();
                const initial = { grams: document.getElementById('nutri-res-gram').innerText, protein: document.getElementById('nutri-res-protein').innerText, carb: document.getElementById('nutri-res-carb').innerText };
                const states = [];
                for (const field of ['scoops_per_serving', 'grams_per_scoop', 'serving_volume_ml', 'serving_kcal']) {
                    for (const value of [0, -5, null, NaN, Infinity, 'invalid', false]) {
                        activeNutriConfig = { ...valid, [field]: value }; runNutriCalc();
                        states.push({ hidden: document.getElementById('nutri-calc-results').hidden, grams: document.getElementById('nutri-res-gram').innerText, warning: document.getElementById('nutri-calc-warning').innerText });
                    }
                }
                catalog[0].nutrition_configs = { ...valid, grams_per_scoop: -5 }; openNutriCalc(catalog[0].drug_code);
                const legacyBlocked = activeNutriConfig === null && document.getElementById('nutri-calc-results').hidden;
                catalog[0].nutrition_configs = { ...valid, product_type: 'liquid', scoops_per_serving: null, grams_per_scoop: null };
                openNutriCalc(catalog[0].drug_code); document.getElementById('nutri-calc-volume').value = '250'; runNutriCalc();
                return { initial, states, legacyBlocked, recovered: !document.getElementById('nutri-calc-results').hidden };
            });
            assert.deepEqual(result.initial, { grams: '25.0', protein: '0.0', carb: '-' });
            assert.ok(result.states.every(state => state.hidden && state.grams === '-' && state.warning.includes('⚠️')));
            assert.equal(result.legacyBlocked, true); assert.equal(result.recovered, true);
        });
    });

    test(`${file}: preparation saves retain failed drafts and prevent duplicate submissions`, async () => {
        await openPage(file, async page => {
            await page.waitForFunction(() => typeof allEnteralDrugs !== 'undefined' ? allEnteralDrugs.length > 0 : allDrugsRaw.length > 0);
            await page.evaluate(async () => {
                const catalog = typeof allEnteralDrugs !== 'undefined' ? allEnteralDrugs : allDrugsRaw;
                openNutriAdmin(catalog[0].drug_code, 'Test');
                document.getElementById('nutri-admin-g-serve').value = '42';
                const originalFrom = window.__mockClient.from;
                window.__mockClient.from = table => {
                    const q = originalFrom(table);
                    if (table === 'nutrition_configs') q.then = (yes, no) => {
                        if (window.__deferUnifiedPrep) return new Promise(resolve => { window.__finishUnifiedPrep = resolve; }).then(yes, no);
                        return Promise.resolve({ data: null, error: { message: '<img src=x> denied' } }).then(yes, no);
                    };
                    return q;
                };
                await saveNutriConfig();
            });
            assert.equal(await page.locator('#nutri-admin-g-serve').inputValue(), '42');
            assert.equal(await page.locator('#nutri-config-error').isVisible(), true);
            assert.equal(await page.locator('#nutri-config-error img').count(), 0);
            assert.equal(await page.locator('#nutri-admin-modal .btn-success').isDisabled(), false);
            await page.evaluate(async () => { window.__deferUnifiedPrep = true; window.__unifiedPrepPromise = saveNutriConfig(); await saveNutriConfig(); });
            assert.equal(await page.evaluate(() => window.__writes.filter(w => w.table === 'nutrition_configs').length), 2);
            assert.equal(await page.locator('#nutri-admin-modal .btn-success').isDisabled(), true);
            await page.evaluate(async () => { window.__finishUnifiedPrep({ data: null, error: { message: 'Failed' } }); await window.__unifiedPrepPromise; });
            assert.equal(await page.locator('#nutri-admin-modal').isVisible(), true);
            assert.equal(await page.locator('#nutri-admin-g-serve').inputValue(), '42');
        });
    });
}

test('IV verified accounts bypass unavailable location and repeated checks do not reload the catalog', async () => {
    await openPage('iv_compat', async page => {
        await page.waitForFunction(() => document.getElementById('main-layout').style.display === 'block' && allDrugNames.length > 0);
        assert.equal(await page.evaluate(() => window.__geoCalls), 0);
        const count = await page.evaluate(async () => {
            let reloads = 0; init = async () => { reloads++; };
            await checkLocationAndInit(); await checkLocationAndInit();
            return reloads;
        });
        assert.equal(count, 0);
        assert.equal(await page.locator('#main-layout').isVisible(), true);
    }, { geoMode: 'denied' });
});

test('IV guests inside the radius keep location-based access', async () => {
    await openPage('iv_compat', async page => {
        await page.waitForFunction(() => allDrugNames.length > 0);
        assert.equal(await page.locator('#main-layout').isVisible(), true);
        assert.equal(await page.evaluate(() => window.__geoCalls), 1);
    }, { ivSignedOut: true });
});

for (const options of [
    { ivSignedOut: true, geoMode: 'outside' },
    { ivSignedOut: true, geoMode: 'denied' },
    { ivSignedOut: true, geoMode: 'timeout' },
    { ivSignedOut: true, geoMode: 'unavailable' },
    { ivSignedOut: true, geoMode: 'unsupported' },
    { ivAnonymous: true, geoMode: 'outside' },
    { ivAuthError: true, geoMode: 'outside' }
]) {
    test(`IV unverified access stays blocked: ${JSON.stringify(options)}`, async () => {
        await openPage('iv_compat', async page => {
            await page.waitForSelector('#geo-overlay form');
            assert.equal(await page.locator('#main-layout').isVisible(), false);
            assert.equal(await page.evaluate(() => allDrugNames.length), 0);
            assert.equal(await page.locator('#geo-overlay input[type="password"]').count(), 1);
            assert.equal(await page.locator('#geo-overlay').isVisible(), true);
        }, options);
    });
}

test('IV login on the location overlay retains errors safely and grants access after verified sign-in', async () => {
    await openPage('iv_compat', async page => {
        await page.waitForSelector('#geo-overlay form');
        await page.evaluate(() => { window.__ivLoginFailure = true; });
        await page.locator('#geo-overlay input[name="email"]').fill('test@example.test');
        await page.locator('#geo-overlay input[name="password"]').fill('test-password');
        await page.locator('#geo-overlay button[type="submit"]').click();
        await page.waitForSelector('.iv-login-error:not([hidden])');
        assert.equal(await page.locator('.iv-login-error img').count(), 0);
        assert.equal(await page.locator('#geo-overlay input[name="password"]').inputValue(), '');
        assert.equal(await page.locator('#main-layout').isVisible(), false);
        await page.evaluate(() => { window.__ivLoginFailure = false; });
        await page.locator('#geo-overlay input[name="password"]').fill('test-password');
        await page.locator('#geo-overlay button[type="submit"]').click();
        await page.waitForFunction(() => document.getElementById('main-layout').style.display === 'block' && allDrugNames.length > 0);
        assert.equal(await page.locator('#geo-overlay').isVisible(), false);
        assert.equal(await page.evaluate(() => window.__geoCalls), 1, 'login must not need another location attempt');
    }, { ivSignedOut: true, geoMode: 'denied' });
});

test('IV sign-out reapplies geofencing and stale GPS callbacks cannot override a newer verified login', async () => {
    await openPage('iv_compat', async page => {
        await page.waitForFunction(() => window.__geoPending.length === 1);
        await page.evaluate(async () => {
            window.__verifiedIvUser = { id: 'user-1', is_anonymous: false };
            await checkLocationAndInit();
            window.__geoPending[0].no({ code: 1 });
            window.__geoPending[0].yes({ coords: { latitude: 14, longitude: 101 } });
        });
        assert.equal(await page.locator('#main-layout').isVisible(), true);
        assert.equal(await page.locator('#geo-overlay').isVisible(), false);
        await page.evaluate(async () => { window.__geoMode = 'outside'; await window.__mockClient.auth.signOut(); });
        await page.waitForSelector('#geo-overlay form');
        assert.equal(await page.locator('#main-layout').isVisible(), false);
    }, { ivSignedOut: true, geoMode: 'deferred' });
});
