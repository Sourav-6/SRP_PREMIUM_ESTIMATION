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
    initHelpModal();
    initSyncPolicySettings();
    initAutoCalculate();
});

function initHelpModal() {
    const helpBtn = document.getElementById('help-btn');
    const helpModal = document.getElementById('help-modal');
    const closeHelpModal = document.getElementById('close-help-modal');

    if (helpBtn && helpModal) {
        helpBtn.addEventListener('click', () => {
            helpModal.classList.remove('hidden');
        });
    }

    if (closeHelpModal && helpModal) {
        closeHelpModal.addEventListener('click', () => {
            helpModal.classList.add('hidden');
        });
    }

    if (helpModal) {
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) {
                helpModal.classList.add('hidden');
            }
        });
    }
}

function initMemberDynamicFields() {
    const memberAgesInput = document.getElementById('memberAges');
    const hiddenMemberCount = document.getElementById('memberCount');
    const container = document.getElementById('dynamic-members-container');

    if (!memberAgesInput || !container) return;

    const parseAndRenderMembers = () => {
        const rawVal = memberAgesInput.value || '';
        const ages = rawVal
            .split(',')
            .map(s => parseInt(s.trim(), 10))
            .filter(n => !isNaN(n) && n > 0 && n <= 100);

        if (ages.length === 0) {
            container.innerHTML = '';
            if (hiddenMemberCount) hiddenMemberCount.value = '';
            return;
        }

        const validAges = ages.slice(0, 10);
        if (hiddenMemberCount) hiddenMemberCount.value = validAges.length;

        container.innerHTML = '';

        validAges.forEach((age, idx) => {
            const i = idx + 1;
            const row = document.createElement('div');
            row.className = 'flex items-center gap-4 p-3 rounded-lg border slide-in';
            row.style.animationDelay = `${i * 50}ms`;
            row.style.background = 'var(--glass-bg)';
            row.style.borderColor = 'var(--border)';

            // Smart relation detection
            let relation = 'Self';
            if (idx === 1) {
                if (validAges[1] >= 18 && Math.abs(validAges[0] - validAges[1]) <= 25) {
                    relation = 'Spouse';
                } else if (validAges[1] >= validAges[0] + 15) {
                    relation = 'Father';
                } else if (validAges[1] < validAges[0] - 15) {
                    relation = 'Child';
                } else {
                    relation = 'Spouse';
                }
            } else if (idx >= 2) {
                if (validAges[idx] < validAges[0] - 12 || validAges[idx] < 25) {
                    relation = 'Child';
                } else if (validAges[idx] >= validAges[0] + 15) {
                    relation = idx % 2 === 0 ? 'Father' : 'Mother';
                } else {
                    relation = 'Child';
                }
            }

            row.innerHTML = `
                <div class="font-semibold text-primary" style="width: 85px; white-space: nowrap;">Member ${i}</div>
                <div class="flex-1">
                    <input type="number" name="memberAge_${i}" value="${age}" min="1" max="120" required class="form-control form-control-sm" style="padding: 0.5rem;" placeholder="Age">
                    <span class="error-msg" id="error-memberAge_${i}" style="display:none; font-size: 0.75rem; color: var(--error);"></span>
                </div>
                <div class="flex-1">
                    <select name="memberRelation_${i}" class="form-control form-control-sm" style="padding: 0.5rem;" required>
                        <option value="Self" ${relation === 'Self' ? 'selected' : ''}>Self</option>
                        <option value="Spouse" ${relation === 'Spouse' ? 'selected' : ''}>Spouse</option>
                        <option value="Child" ${relation === 'Child' ? 'selected' : ''}>Child</option>
                        <option value="Father" ${relation === 'Father' ? 'selected' : ''}>Father</option>
                        <option value="Mother" ${relation === 'Mother' ? 'selected' : ''}>Mother</option>
                    </select>
                </div>
                <div class="flex items-center gap-2" style="width: 95px;">
                    <input type="checkbox" name="memberAbcd_${i}" id="abcd_${i}" value="yes">
                    <label for="abcd_${i}" class="m-0 cursor-pointer text-xs font-medium" style="white-space: nowrap;">ABCD Care</label>
                </div>
            `;
            container.appendChild(row);
        });
    };

    memberAgesInput.addEventListener('input', parseAndRenderMembers);
    memberAgesInput.addEventListener('change', parseAndRenderMembers);

    parseAndRenderMembers();
}

function initSyncPolicySettings() {
    const form = document.getElementById('calculator-form');
    
    // Common settings suffixes to synchronize across policy sections
    const linkedSuffixes = [
        'policyHistory',
        'nri',
        'porting',
        'existingCustomer',
        'claim',
        'unlimitedRestore',
        'limitlessRider',
        'wellbeingRider'
    ];

    form.addEventListener('change', (e) => {
        const target = e.target;
        if (!target || !target.name) return;

        for (const suffix of linkedSuffixes) {
            if (target.name.endsWith(`_${suffix}`) || target.name === suffix) {
                const isCheckbox = target.type === 'checkbox';
                const selector = `[name$="_${suffix}"]`;
                const matchingInputs = form.querySelectorAll(selector);

                matchingInputs.forEach(input => {
                    if (input !== target) {
                        if (isCheckbox) {
                            input.checked = target.checked;
                        } else {
                            input.value = target.value;
                        }
                    }
                });
                break;
            }
        }
    });
}

function updateLimitlessRiderState() {
    const form = document.getElementById('calculator-form');
    if (!form) return;
    const formData = new FormData(form);
    const siRaw = formData.get('sumInsured');
    const parsedSI = siRaw === 'unlimited' ? 100000000 : parseInt(siRaw, 10);

    const isBelow10L = isNaN(parsedSI) || parsedSI < 1000000;
    const limitlessToggles = form.querySelectorAll('[name$="_limitlessRider"]');

    limitlessToggles.forEach(toggle => {
        const formGroup = toggle.closest('.form-group') || toggle.closest('.toggle-label');
        if (isBelow10L) {
            if (toggle.checked) toggle.checked = false;
            toggle.disabled = true;
            if (formGroup) {
                formGroup.style.opacity = '0.5';
                formGroup.style.pointerEvents = 'none';
            }
        } else {
            toggle.disabled = false;
            if (formGroup) {
                formGroup.style.opacity = '1';
                formGroup.style.pointerEvents = 'auto';
            }
        }
    });
}

function initAutoCalculate() {
    const form = document.getElementById('calculator-form');
    
    const handleUpdate = () => {
        updateLimitlessRiderState();
        if (validateSetup(false)) {
            calculateAllQuotes();
        }
    };

    // Listen to all changes inside the form
    form.addEventListener('input', handleUpdate);
    form.addEventListener('change', handleUpdate);

    updateLimitlessRiderState();
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
    let siRaw = formData.get('sumInsured');
    let parsedSI = siRaw === 'unlimited' ? 'unlimited' : parseInt(siRaw, 10);

    const inputs = {
        sumInsured: parsedSI,
        members: [],
        deductible: parseInt(formData.get('deductible'), 10),
        paymentMode: formData.get('paymentMode') || 'loan_emi'
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
        { id: 'secure', prefix: 'optima_secure', name: 'Optima Secure', calculator: calculateOptimaSecurePremium, supportedYears: [1, 2, 3, 4, 5] },
        { id: 'secure_plus', prefix: 'optima_secure_plus', name: 'Optima Secure Plus', calculator: calculatePremium, supportedYears: [1, 2, 3, 4, 5] },
        { id: 'super_secure', prefix: 'optima_super_secure', name: 'Optima Super Secure', calculator: calculateSuperSecurePremium, supportedYears: [3] },
        { id: 'ab_activ_one_max', prefix: 'ab_activ_one_max', name: 'Aditya Birla Activ One Max', calculator: calculateAdityaBirlaPremium, supportedYears: [1] },
        { id: 'ab_activ_yuva', prefix: 'ab_activ_yuva', name: 'Aditya Birla Activ Yuva', calculator: calculateAdityaBirlaPremium, supportedYears: [1] }
    ];

    let anyPlanValid = false;

    plans.forEach(plan => {
        const tr = document.createElement('tr');
        const nameTd = document.createElement('td');
        nameTd.innerHTML = `<strong>${plan.name}</strong>`;
        tr.appendChild(nameTd);

        let hasValidPremium = false;

        for (let year = 1; year <= 5; year++) {
            const td = document.createElement('td');
            if (!plan.supportedYears.includes(year)) {
                td.className = 'premium-na';
                td.textContent = 'N/A';
            } else {
                try {
                    // Extract plan-specific modifiers dynamically
                    const formData = new FormData(document.getElementById('calculator-form'));
                    const planInputs = { 
                        ...inputs, 
                        tenure: year, 
                        planType: plan.id,
                        nri: formData.get(`${plan.prefix}_nri`) === 'on',
                        policyHistory: formData.get(`${plan.prefix}_policyHistory`) || 'first_time_buyer',
                        porting: formData.get(`${plan.prefix}_porting`) === 'on',
                        existingCustomer: formData.get(`${plan.prefix}_existingCustomer`) === 'on',
                        claim: formData.get(`${plan.prefix}_claim`) === 'on',
                        unlimitedRestore: formData.get(`${plan.prefix}_unlimitedRestore`) === 'on',
                        limitlessRider: formData.get(`${plan.prefix}_limitlessRider`) === 'on',
                        wellbeingRider: formData.get(`${plan.prefix}_wellbeingRider`) === 'on'
                    };
                    const result = plan.calculator(planInputs, appConfig, allRates);
                    td.className = 'premium-value flex-col items-center';
                    
                    // Premium
                    const premiumDiv = document.createElement('div');
                    premiumDiv.textContent = formatCurrency(result.finalPremium);
                    td.appendChild(premiumDiv);

                    // EMI Logic (Not applicable for Aditya Birla plans)
                    const isAdityaBirla = plan.id.startsWith('ab_');
                    if (!isAdityaBirla) {
                        if (inputs.paymentMode === 'loan_emi') {
                            let downPaymentPct = 0;
                            let loanTenureMonths = 0;
                            if (year === 1) {
                                downPaymentPct = 0.15;
                                loanTenureMonths = 11;
                            } else if (year >= 2 && year <= 4) {
                                downPaymentPct = 0.10;
                                loanTenureMonths = year === 2 ? 21 : (year === 3 ? 30 : 36);
                            } else if (year === 5) {
                                downPaymentPct = 0.05;
                                loanTenureMonths = 36;
                            }
                            
                            const loanAmount = result.finalPremium;
                            const downPayment = loanAmount * downPaymentPct;
                            const emi = (loanAmount - downPayment) * ((1 / loanTenureMonths) + 0.0084);
                            
                            const emiDiv = document.createElement('div');
                            emiDiv.className = 'text-muted mt-1';
                            emiDiv.style.fontSize = '0.75rem';
                            emiDiv.style.fontWeight = 'normal';
                            emiDiv.textContent = `EMI: ${formatCurrency(Math.round(emi))}/mo`;
                            td.appendChild(emiDiv);
                            
                        } else if (inputs.paymentMode === 'monthly_split') {
                            const emiDiv = document.createElement('div');
                            emiDiv.className = 'text-muted mt-1';
                            emiDiv.style.fontSize = '0.75rem';
                            emiDiv.style.fontWeight = 'normal';
                            if (year <= 3) {
                                const splitMonths = year * 12;
                                const emi = result.finalPremium / splitMonths;
                                emiDiv.textContent = `Split: ${formatCurrency(Math.round(emi))}/mo`;
                            } else {
                                emiDiv.textContent = `Split: N/A`;
                            }
                            td.appendChild(emiDiv);
                        }
                    }
                    td.title = 'Click to view breakdown';
                    td.addEventListener('click', () => {
                        toggleBreakdown(tr, td, plan.name, year, result);
                    });
                    hasValidPremium = true;
                } catch (e) {
                    td.className = 'premium-na';
                    td.textContent = 'N/A';
                    td.title = e.message;
                }
            }
            tr.appendChild(td);
        }
        
        if (hasValidPremium) {
            tbody.appendChild(tr);
            anyPlanValid = true;
        }
    });

    if (!anyPlanValid) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 6;
        td.className = 'text-center text-muted py-4';
        td.textContent = 'Please enter family member ages (e.g. 55, 45, 15, 10) above to calculate premium quotes.';
        tbody.appendChild(tr);
    }
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
            <table class="breakdown-table mb-4">
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
            
            ${(() => {
                if (planName.includes('Aditya Birla')) {
                    return `
                    <div style="background: var(--bg-card); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border);">
                        <h5 class="font-semibold mb-2 text-xs uppercase tracking-wider text-primary">EMI Options Comparison</h5>
                        <div class="text-sm text-muted italic">EMI payment options are not available for Aditya Birla plans. Only Annual payment is supported.</div>
                    </div>
                    `;
                }

                let downPaymentPct = year === 1 ? 0.15 : (year <= 4 ? 0.10 : 0.05);
                let loanTenureMonths = year === 1 ? 11 : (year === 2 ? 21 : (year === 3 ? 30 : 36));
                const downPayment = result.finalPremium * downPaymentPct;
                
                // Calculate Loan EMI
                const calcFee = result.finalPremium * 0.0118;
                const processingFee = Math.max(354, calcFee);
                const feeMessage = calcFee < 354 ? 'Minimum ₹354 applied' : 'Calculated at 1.18% of premium';
                
                const loanEmi = (result.finalPremium - downPayment) * ((1 / loanTenureMonths) + 0.0084);
                const payNow = downPayment + processingFee;
                const loanTotalPayable = payNow + (loanEmi * loanTenureMonths);
                
                // Monthly Split EMI (No processing fee, no down payment)
                const splitEmi = result.finalPremium / (year * 12);
                const splitTotalPayable = result.finalPremium;
                
                const tooltipHtml = `
                    <span onclick="const t = this.querySelector('.custom-tooltip'); const isVis = t.style.visibility === 'visible'; document.querySelectorAll('.custom-tooltip').forEach(el => {el.style.visibility='hidden'; el.style.opacity='0';}); if(!isVis) { t.style.visibility='visible'; t.style.opacity='1'; } event.stopPropagation();" 
                          style="position: relative; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: var(--border); color: var(--text-muted); font-size: 11px; font-weight: bold; cursor: pointer; margin-left: 4px;">
                        ?
                        <span class="custom-tooltip" style="visibility: hidden; opacity: 0; transition: opacity 0.2s; background-color: var(--bg-card); border: 1px solid var(--border); color: var(--text); text-align: center; border-radius: 6px; padding: 4px 8px; position: absolute; z-index: 100; left: 140%; top: 50%; transform: translateY(-50%); font-size: 11px; white-space: nowrap; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                            ${feeMessage}
                            <svg style="position: absolute; right: 100%; top: 50%; transform: translateY(-50%); margin-right: -1px;" width="5" height="10" viewBox="0 0 5 10"><polygon points="0,5 5,0 5,10" fill="var(--bg-card)"/></svg>
                        </span>
                    </span>
                `;
                
                return `
                <div style="background: var(--bg-card); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border);">
                    <h5 class="font-semibold mb-3 text-xs uppercase tracking-wider text-primary">EMI Options Comparison</h5>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.25rem;">
                        <!-- Loan EMI Card -->
                        <div style="background: var(--bg-body); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border); display: flex; flex-direction: column; justify-content: space-between;">
                            <div>
                                <div class="font-semibold text-primary text-base mb-3 pb-2" style="border-bottom: 1px solid var(--border);">Loan EMI</div>
                                
                                <div class="text-xs uppercase tracking-wider font-semibold text-muted mb-2">Upfront Charges</div>
                                <div class="text-sm flex justify-between mb-1.5 text-muted">
                                    <span>Down Payment (${downPaymentPct*100}%):</span>
                                    <span class="font-medium text-text">${formatCurrency(Math.round(downPayment))}</span>
                                </div>
                                <div class="text-sm flex justify-between mb-3 text-muted">
                                    <span>Processing Fee: ${tooltipHtml}</span>
                                    <span class="font-medium text-text">${formatCurrency(Math.round(processingFee))}</span>
                                </div>

                                <div class="text-xs uppercase tracking-wider font-semibold text-muted mb-2 pt-2" style="border-top: 1px dashed var(--border);">Repayment Terms</div>
                                <div class="text-sm flex justify-between mb-1.5 text-muted">
                                    <span>Loan Tenure:</span>
                                    <span class="font-medium text-text">${loanTenureMonths} months</span>
                                </div>
                                <div class="text-sm flex justify-between mb-3">
                                    <span class="font-semibold text-muted">Monthly EMI:</span>
                                    <span class="font-bold text-primary">${formatCurrency(Math.round(loanEmi))} / mo</span>
                                </div>

                                <div class="text-sm flex justify-between pt-2 mb-4" style="border-top: 1px solid var(--border);">
                                    <span class="font-semibold text-muted">Total Amount Payable:</span>
                                    <span class="font-bold text-text">${formatCurrency(Math.round(loanTotalPayable))}</span>
                                </div>
                            </div>

                            <button type="button" class="btn btn-primary no-pdf pay-now-btn" 
                                    style="width: 100%; padding: 0.75rem 1rem; border-radius: 6px; font-weight: 600; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center; cursor: pointer; box-shadow: 0 4px 12px rgba(26, 86, 219, 0.25);"
                                    onclick="event.stopPropagation(); alert('Proceeding to payment for Pay Now amount: ${formatCurrency(Math.round(payNow))}')">
                                <span>Pay Now (Upfront)</span> 
                                <span style="font-size: 1rem; font-weight: 700;">${formatCurrency(Math.round(payNow))}</span>
                            </button>
                        </div>
                        
                        <!-- Monthly Split Card -->
                        <div style="background: var(--bg-body); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border); display: flex; flex-direction: column; justify-content: space-between;">
                            ${year <= 3 ? `
                                <div>
                                    <div class="font-semibold text-primary text-base mb-3 pb-2" style="border-bottom: 1px solid var(--border);">Monthly Split</div>
                                    
                                    <div class="text-xs uppercase tracking-wider font-semibold text-muted mb-2">Repayment Terms</div>
                                    <div class="text-sm flex justify-between mb-1.5 text-muted">
                                        <span>Split Tenure:</span>
                                        <span class="font-medium text-text">${year * 12} months</span>
                                    </div>
                                    <div class="text-sm flex justify-between mb-3">
                                        <span class="font-semibold text-muted">Monthly EMI:</span>
                                        <span class="font-bold text-primary">${formatCurrency(Math.round(splitEmi))} / mo</span>
                                    </div>

                                    <div class="text-sm flex justify-between pt-2 mb-4" style="border-top: 1px solid var(--border);">
                                        <span class="font-semibold text-muted">Total Amount Payable:</span>
                                        <span class="font-bold text-text">${formatCurrency(Math.round(splitTotalPayable))}</span>
                                    </div>
                                </div>

                                <button type="button" class="btn btn-primary no-pdf pay-now-btn" 
                                        style="width: 100%; padding: 0.75rem 1rem; border-radius: 6px; font-weight: 600; font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center; cursor: pointer; box-shadow: 0 4px 12px rgba(26, 86, 219, 0.25);"
                                        onclick="event.stopPropagation(); alert('Proceeding to payment for 1st Month split amount: ${formatCurrency(Math.round(splitEmi))}')">
                                    <span>Pay Now (1st Month)</span> 
                                    <span style="font-size: 1rem; font-weight: 700;">${formatCurrency(Math.round(splitEmi))}</span>
                                </button>
                            ` : `
                                <div>
                                    <div class="font-semibold text-primary text-base mb-3 pb-2" style="border-bottom: 1px solid var(--border);">Monthly Split</div>
                                    <div class="text-sm text-muted mt-4 text-center italic py-6">Not applicable for > 3 years.</div>
                                </div>
                            `}
                        </div>
                    </div>
                </div>
                `;
            })()}
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
