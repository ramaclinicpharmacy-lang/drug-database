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
        window.__mockClient = {
            from: query, rpc: async () => ({ data: null, error: null }),
            auth: { getSession: async () => ({ data: { session: { user: { email: 'test@example.test' } } } }),
                onAuthStateChange: () => ({}), signOut: async () => ({ error: null }) }
        };
        Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: yes => yes({ coords: { latitude: 13.7665, longitude: 100.5272 } }) } });
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

test('ready-to-feed calculator blocks impossible concentrations, clears stale results, and recovers', async () => {
    await openPage('index', async page => {
        await page.waitForFunction(() => allDrugsRaw.length > 0);
        await page.evaluate(() => {
            allDrugsRaw[0].nutrition_configs = { product_type: 'liquid', serving_volume_ml: 250, serving_kcal: 250,
                protein_per_serving: 10, carb_per_serving: 30, fat_per_serving: 10 };
            openNutriCalc(allDrugsRaw[0].drug_code);
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
            allDrugsRaw[0].nutrition_configs.serving_kcal = 250;
            openNutriCalc(allDrugsRaw[0].drug_code);
        });
        assert.equal(await page.locator('#nutri-calc-results').isVisible(), false);
        assert.equal(await page.locator('#nutri-calc-warning').isVisible(), false);
    });
});

test('powder concentration selection and calculation remain available', async () => {
    await openPage('index', async page => {
        await page.waitForFunction(() => allDrugsRaw.length > 0);
        await page.evaluate(() => openNutriCalc(allDrugsRaw[0].drug_code));
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
