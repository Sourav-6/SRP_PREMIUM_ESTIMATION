import { validateInputs } from './validation.js';
import { calculatePremium } from './calculator.js'; // Optima Secure Plus
import { calculateSuperSecurePremium } from './optima_super_secure_calculator.js';
import { calculateOptimaSecurePremium } from './optima_secure_calculator.js';
import { calculateAdityaBirlaPremium } from './aditya_birla_calculator.js';
import { adityaBirlaRates } from './aditya_birla_rates.js';
import { formatCurrency, showNotification } from './utils.js';
import { downloadPDF } from './pdf.js';

let appConfig = null;
let appRates = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const [configRes, ratesRes] = await Promise.all([
            fetch('./js/config.json'),
            fetch('./js/rates.json')
        ]);
        appConfig = await configRes.json();
        appRates = await ratesRes.json();
    } catch (e) {
        console.error("Failed to load configuration or rates", e);
        showNotification("Failed to load application configuration.", "error");
        return; 
    }

    initMemberDynamicFields();
    initThemeToggle();
    initAutoCalculate();
});

function initMemberDynamicFields() {
    const memberSelect = document.getElementById('memberCount');
    const container = document.getElementById('dynamic-members-container');

    memberSelect.addEventListener('change', (e) => {
        const count = parseInt(e.target.value, 10);
        container.innerHTML = '';

        if (!count || isNaN(count)) return;

        for (let i = 1; i <= count; i++) {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-4 p-3 rounded-lg border slide-in';
            row.style.animationDelay = `${i * 50}ms`;
            row.style.background = 'var(--glass-bg)';
            row.style.borderColor = 'var(--border)';
            
            row.innerHTML = `
                <div class="font-semibold text-primary" style="width: 85px; white-space: nowrap;">Member ${i}</div>
                <div class="flex-1">
                    <input type="number" name="memberAge_${i}" min="1" max="120" required class="form-control form-control-sm" style="padding: 0.5rem;" placeholder="Age">
                    <span class="error-msg" id="error-memberAge_${i}" style="display:none; font-size: 0.75rem; color: var(--error);"></span>
                </div>
                <div class="flex-1">
                    <select name="memberRelation_${i}" class="form-control form-control-sm" style="padding: 0.5rem;" required>
                        <option value="Self" ${i === 1 ? 'selected' : ''}>Self</option>
                        <option value="Spouse" ${i === 2 ? 'selected' : ''}>Spouse</option>
                        <option value="Child" ${i > 2 ? 'selected' : ''}>Child</option>
                        <option value="Father">Father</option>
                        <option value="Mother">Mother</option>
                    </select>
                </div>
                <div class="flex items-center gap-2" style="width: 95px;">
                    <input type="checkbox" name="memberAbcd_${i}" id="abcd_${i}" value="yes">
                    <label for="abcd_${i}" class="m-0 cursor-pointer text-xs font-medium" style="white-space: nowrap;">ABCD Care</label>
                </div>
            `;
            // Do not wrap so it stays strictly on one line
            container.appendChild(row);
        }
    });

    if (memberSelect.value) {
        memberSelect.dispatchEvent(new Event('change'));
    }
}

function initAutoCalculate() {
    const form = document.getElementById('calculator-form');
    
    // Listen to all changes inside the form
    form.addEventListener('input', () => {
        if (validateSetup(false)) {
            calculateAllQuotes();
        }
    });

    form.addEventListener('change', () => {
        if (validateSetup(false)) {
            calculateAllQuotes();
        }
    });
}

function validateSetup() {
    clearErrors();
    const form = document.getElementById('calculator-form');
    const formData = new FormData(form);
    
    const allErrors = validateInputs(formData);
    const stepErrors = allErrors.filter(e => e.field === 'sumInsured' || e.field === 'memberCount' || e.field.startsWith('member'));

    if (stepErrors.length > 0) {
        stepErrors.forEach(err => {
            const errorElement = document.getElementById(`error-${err.field}`);
            if (errorElement) {
                errorElement.textContent = err.message;
                errorElement.style.display = 'block';
            }
        });
        showNotification("Please fix the highlighted errors.", "error");
        return false;
    }
    return true;
}

function clearErrors() {
    document.querySelectorAll('.error-msg').forEach(el => {
        el.textContent = '';
        el.style.display = 'none';
    });
}

// Removed initLiveCalculations as it is superseded by initAutoCalculate

function getBaseInputs() {
    const form = document.getElementById('calculator-form');
    const formData = new FormData(form);
    
    const inputs = {
        sumInsured: parseInt(formData.get('sumInsured'), 10),
        members: [],
        nri: formData.get('nri') === 'on',
        deductible: parseInt(formData.get('deductible'), 10),
        policyHistory: formData.get('policyHistory'),
        porting: formData.get('porting') === 'on',
        existingCustomer: formData.get('existingCustomer') === 'on',
        claim: formData.get('claim') === 'on',
        unlimitedRestore: formData.get('unlimitedRestore') === 'on',
        limitlessRider: formData.get('limitlessRider') === 'on',
        wellbeingRider: formData.get('wellbeingRider') === 'on'
    };

    const count = parseInt(formData.get('memberCount'), 10);
    for (let i = 1; i <= count; i++) {
        inputs.members.push({
            name: formData.get(`memberName_${i}`) || `Member ${i}`,
            age: parseInt(formData.get(`memberAge_${i}`), 10),
            relation: formData.get(`memberRelation_${i}`) || `Member`,
            abcd: formData.get(`memberAbcd_${i}`) === 'yes' || formData.get(`memberAbcd_${i}`) === 'on'
        });
    }
    return inputs;
}

function calculateAllQuotes() {
    const tbody = document.getElementById('comparison-table-body');
    tbody.innerHTML = '';
    
    const inputs = getBaseInputs();
    const allRates = { ...appRates, adityaBirlaRates };

    const plans = [
        { id: 'secure', name: 'Optima Secure', calculator: calculateOptimaSecurePremium, supportedYears: [1, 2, 3, 4, 5] },
        { id: 'secure_plus', name: 'Optima Secure Plus', calculator: calculatePremium, supportedYears: [1, 2, 3, 4, 5] },
        { id: 'super_secure', name: 'Optima Super Secure', calculator: calculateSuperSecurePremium, supportedYears: [3] },
        { id: 'ab_activ_one_max', name: 'Aditya Birla Activ One Max', calculator: calculateAdityaBirlaPremium, supportedYears: [1] },
        { id: 'ab_activ_yuva', name: 'Aditya Birla Activ Yuva', calculator: calculateAdityaBirlaPremium, supportedYears: [1] }
    ];

    plans.forEach(plan => {
        const tr = document.createElement('tr');
        const nameTd = document.createElement('td');
        nameTd.innerHTML = `<strong>${plan.name}</strong>`;
        tr.appendChild(nameTd);

        for (let year = 1; year <= 5; year++) {
            const td = document.createElement('td');
            if (!plan.supportedYears.includes(year)) {
                td.className = 'premium-na';
                td.textContent = 'N/A';
            } else {
                try {
                    // Override planType dynamically so calculators know which riders/logic apply
                    const planInputs = { ...inputs, tenure: year, planType: plan.id };
                    const result = plan.calculator(planInputs, appConfig, allRates);
                    td.className = 'premium-value';
                    td.textContent = formatCurrency(result.finalPremium);
                    td.title = 'Click to view breakdown';
                    td.addEventListener('click', () => {
                        toggleBreakdown(tr, td, plan.name, year, result);
                    });
                } catch (e) {
                    td.className = 'premium-na text-error';
                    td.textContent = 'Err';
                    td.title = e.message;
                    console.error(`Calculation error for ${plan.name} year ${year}:`, e);
                }
            }
            tr.appendChild(td);
        }
        tbody.appendChild(tr);
    });
}

function toggleBreakdown(parentTr, clickedTd, planName, year, result) {
    // Remove active styles from other cells in this row
    Array.from(parentTr.children).forEach(c => c.style.backgroundColor = '');
    
    let existingBreakdown = parentTr.nextElementSibling;
    if (existingBreakdown && existingBreakdown.classList.contains('breakdown-row')) {
        const isSameCell = existingBreakdown.dataset.cellIndex === clickedTd.cellIndex.toString();
        existingBreakdown.remove();
        if (isSameCell) return; // Just toggle off
    }
    
    // Highlight the clicked cell
    clickedTd.style.backgroundColor = 'var(--primary-light)';
    
    const bdRow = document.createElement('tr');
    bdRow.className = 'breakdown-row';
    bdRow.dataset.cellIndex = clickedTd.cellIndex;
    
    const bdCell = document.createElement('td');
    bdCell.colSpan = 6;
    bdCell.innerHTML = `
        <div class="breakdown-content">
            <div class="flex justify-between items-center mb-3">
                <h4 class="font-semibold text-primary m-0">${planName} - ${year} Year(s) Breakdown</h4>
                <button type="button" class="btn btn-primary btn-sm no-pdf download-pdf-btn">⬇ Download PDF</button>
            </div>
            <table class="breakdown-table">
                <tbody>
                    ${result.breakdown.memberBreakdown.map(m => `
                        <tr>
                            <td>${m.name} ${m.note ? `<span style="font-size: 0.85em; color: var(--text-muted); margin-left: 5px;">${m.note}</span>` : ''}</td>
                            <td>${formatCurrency(m.amount)}</td>
                        </tr>
                    `).join('')}
                    ${result.breakdown.totalBasePremium ? `
                        <tr style="border-top: 2px solid var(--border); font-weight: 500;">
                            <td>Total Base Premium</td>
                            <td>${formatCurrency(result.breakdown.totalBasePremium)}</td>
                        </tr>
                    ` : ''}
                    ${result.breakdown.adjustments.map(a => `
                        <tr>
                            <td>${a.name}</td>
                            <td class="${a.amount > 0 ? 'amount-positive' : 'amount-negative'}">${a.amount > 0 ? '+' : ''}${formatCurrency(a.amount)}</td>
                        </tr>
                    `).join('')}
                    <tr style="border-top: 2px solid var(--border); font-size: 1.1rem; color: var(--primary-dark);">
                        <td><strong>Final Premium (incl. GST)</strong></td>
                        <td><strong>${formatCurrency(result.finalPremium)}</strong></td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
    bdRow.appendChild(bdCell);
    
    // Attach PDF download listener
    const downloadBtn = bdCell.querySelector('.download-pdf-btn');
    const contentToDownload = bdCell.querySelector('.breakdown-content');
    downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent clicking cell again
        downloadPDF(contentToDownload, `${planName.replace(/\s+/g, '-')}-${year}Yr-Quote.pdf`);
    });

    parentTr.parentNode.insertBefore(bdRow, parentTr.nextSibling);
}

function initThemeToggle() {
    const toggle = document.getElementById('theme-toggle');
    const html = document.documentElement;
    
    if (localStorage.getItem('theme') === 'dark' || 
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        html.setAttribute('data-theme', 'dark');
        toggle.checked = true;
    }

    toggle.addEventListener('change', (e) => {
        if (e.target.checked) {
            html.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        } else {
            html.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        }
    });
}
