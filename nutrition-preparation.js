/* Shared validation for preparation editors and calculators on both pages. */
(function () {
    'use strict';
    function number(value, label, optional = false) {
        if (optional && (value == null || value === '')) return null;
        if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') throw new Error(label + ' ไม่ครบถ้วน');
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || (optional ? parsed < 0 : parsed <= 0)) {
            throw new Error(label + (optional ? ' ต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป หรือเว้นว่าง' : ' ต้องเป็นตัวเลขมากกว่า 0'));
        }
        return parsed;
    }

    function validateConfig(source) {
        if (!source || !['powder', 'liquid'].includes(source.product_type)) throw new Error('รูปแบบผลิตภัณฑ์ไม่ถูกต้อง');
        const config = { ...source };
        for (const [key, label] of [['serving_volume_ml', 'ปริมาตร'], ['serving_kcal', 'พลังงาน']]) config[key] = number(source[key], label);
        for (const [key, label] of [['protein_per_serving', 'โปรตีน'], ['carb_per_serving', 'คาร์โบไฮเดรต'], ['fat_per_serving', 'ไขมัน']]) config[key] = number(source[key], label, true);
        if (config.product_type === 'powder') {
            config.scoops_per_serving = number(source.scoops_per_serving, 'จำนวนช้อน');
            config.grams_per_scoop = number(source.grams_per_scoop, 'น้ำหนักต่อช้อน');
            number(config.scoops_per_serving * config.grams_per_scoop, 'น้ำหนักรวมต่อมื้อ');
        } else {
            config.scoops_per_serving = null;
            config.grams_per_scoop = null;
        }
        number(config.serving_kcal / config.serving_volume_ml, 'ความเข้มข้นของผลิตภัณฑ์');
        return config;
    }

    function readForm(code) {
        const read = (id, label, optional = false) => {
            const input = document.getElementById(id);
            if (input.validity.badInput) throw new Error(label + ' ต้องเป็นตัวเลขที่ถูกต้อง');
            return number(input.value.trim(), label, optional);
        };
        const type = document.getElementById('nutri-admin-type').value;
        const scoops = type === 'powder' ? read('nutri-admin-scoops', 'จำนวนช้อน') : null;
        const grams = type === 'powder' ? read('nutri-admin-g-serve', 'น้ำหนักรวมต่อมื้อ') : null;
        return validateConfig({
            drug_code: code, product_type: type,
            grams_per_scoop: type === 'powder' ? Number((grams / scoops).toFixed(4)) : null,
            scoops_per_serving: scoops,
            serving_volume_ml: read(type === 'powder' ? 'nutri-admin-powder-vol' : 'nutri-admin-liquid-vol', 'ปริมาตร'),
            serving_kcal: read(type === 'powder' ? 'nutri-admin-powder-kcal' : 'nutri-admin-liquid-kcal', 'พลังงาน'),
            protein_per_serving: read('nutri-admin-protein', 'โปรตีน', true),
            carb_per_serving: read('nutri-admin-carb', 'คาร์โบไฮเดรต', true),
            fat_per_serving: read('nutri-admin-fat', 'ไขมัน', true),
            preparation_note: document.getElementById('nutri-admin-note').value.trim() || null,
            updated_at: new Date().toISOString()
        });
    }

    function validatePortion(config, multiplier) {
        number(multiplier, 'สัดส่วนการเตรียม');
        number(multiplier * config.serving_volume_ml, 'ปริมาตรที่คำนวณได้');
        if (config.product_type === 'powder') {
            number(multiplier * config.scoops_per_serving, 'จำนวนช้อนที่คำนวณได้');
            number(multiplier * config.scoops_per_serving * config.grams_per_scoop, 'น้ำหนักที่คำนวณได้');
        }
        for (const key of ['protein_per_serving', 'carb_per_serving', 'fat_per_serving']) {
            if (config[key] !== null) number(multiplier * config[key], 'สารอาหารที่คำนวณได้', true);
        }
    }
    window.NutritionPreparation = Object.freeze({ readForm, validateConfig, validatePortion });
})();
