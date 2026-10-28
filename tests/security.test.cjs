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

async function openPage(file, run) {
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.dismiss());
    await page.addInitScript(({ text, code }) => {
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
            for (const name of ['select', 'eq', 'neq', 'in', 'order', 'limit', 'match', 'gte', 'lte', 'or']) q[name] = () => q;
            q.range = first => { q.first = first; return q; };
            q.single = q.maybeSingle = () => { q.singleRow = true; return q; };
            for (const op of ['insert', 'upsert', 'delete', 'update']) q[op] = payload => {
                q.operation = op; window.__writes.push({ table, operation: op, payload }); return q;
            };
            q.then = (yes, no) => Promise.resolve({
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
    }, { text, code });
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
            const manualOnly = { crcl: get('result-crcl').innerText, egfr: get('result-egfr').innerText, yellow: count('crcl'), green: count('egfr'), warning: get('dynamic-warning').innerText };
            get('calc-wt').value = '70'; get('calc-ht').value = '170';
            calculateInlineCrCl(code);
            const absoluteOnly = { absolute: get('result-abs-gfr').innerText, yellow: count('crcl') };
            get('calc-age').value = '60'; get('calc-scr').value = '1';
            calculateInlineCrCl(code);
            const both = { crcl: get('result-crcl').innerText, egfr: get('result-egfr').innerText, yellow: count('crcl'), green: count('egfr') };
            get('manual-egfr').value = '-5';
            calculateInlineCrCl(code);
            const invalidManual = { egfr: get('result-egfr').innerText, yellow: count('crcl'), green: count('egfr'), warning: get('dynamic-warning').innerText };
            clearInlineCrCl(code);
            const cleared = { yellow: count('crcl'), green: count('egfr'), warning: get('dynamic-warning').innerText };
            return { manualOnly, absoluteOnly, both, invalidManual, cleared };
        }, code);
        assert.equal(result.manualOnly.crcl, '-');
        assert.equal(result.manualOnly.egfr, '45.0');
        assert.equal(result.manualOnly.yellow, 0);
        assert.equal(result.manualOnly.green, 1);
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
