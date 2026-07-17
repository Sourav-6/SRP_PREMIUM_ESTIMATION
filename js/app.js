import { validateInputs } from './validation.js';
import { calculatePremium } from './calculator.js';
import { formatCurrency, showNotification, copyToClipboard } from './utils.js';
import { downloadPDF } from './pdf.js';

let appConfig = null;
let appRates = null;
let currentStep = 1;
const totalSteps = 4;
let selectedPremium = 0;

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Load config and rates
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
        return; // Halts app initialization
    }

    // 2. Initialize UI Elements
    initMemberDynamicFields();
    initNavigation();
    initThemeToggle();
    initActionButtons();
    initHelpModal();
    
    // Setup initial state
    updateStepUI();
});

function initMemberDynamicFields() {
    const memberSelect = document.getElementById('memberCount');
    const container = document.getElementById('dynamic-members-container');

    memberSelect.addEventListener('change', (e) => {
        const count = parseInt(e.target.value, 10);
        container.innerHTML = ''; // Clear existing

        if (!count || isNaN(count)) return;

        for (let i = 1; i <= count; i++) {
            const card = document.createElement('div');
            card.className = 'glass-card p-4 rounded-lg mb-4 slide-in';
            card.style.animationDelay = `${i * 50}ms`;
            
            card.innerHTML = `
                <h3 class="text-lg font-semibold mb-3 text-primary">Member ${i}</h3>
                <div class="form-grid">
                    <div class="form-group">
                        <label>Name (Optional)</label>
                        <input type="text" name="memberName_${i}" placeholder="E.g., John Doe" class="form-control">
                    </div>
                    <div class="form-group">
                        <label>Age <span class="text-error">*</span></label>
                        <input type="number" name="memberAge_${i}" min="1" max="120" required class="form-control" placeholder="Years">
                        <span class="error-msg" id="error-memberAge_${i}"></span>
                    </div>
                    <div class="form-group">
                        <label>Relationship <span class="text-error">*</span></label>
                        <select name="memberRelation_${i}" class="form-control">
                            <option value="Self">Self</option>
                            <option value="Spouse">Spouse</option>
                            <option value="Son">Son</option>
                            <option value="Daughter">Daughter</option>
                            <option value="Father">Father</option>
                            <option value="Mother">Mother</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div class="form-group checkbox-align">
                        <input type="checkbox" name="memberAbcd_${i}" id="abcd_${i}" value="yes">
                        <label for="abcd_${i}" style="margin:0; cursor:pointer;">ABCD Chronic Care</label>
                    </div>
                </div>
            `;
            container.appendChild(card);
        }
    });

    // Trigger initial render if browser preserved the form state on reload
    if (memberSelect.value) {
        memberSelect.dispatchEvent(new Event('change'));
    }
}

function initNavigation() {
    const nextBtns = document.querySelectorAll('.next-btn');
    const backBtns = document.querySelectorAll('.back-btn');

    nextBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (validateCurrentStep()) {
                if (currentStep === 3) {
                    processCalculation();
                } else {
                    currentStep++;
                    updateStepUI();
                }
            }
        });
    });

    backBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (currentStep > 1) {
                currentStep--;
                updateStepUI();
            }
        });
    });
}

function validateCurrentStep() {
    clearErrors();
    const form = document.getElementById('calculator-form');
    const formData = new FormData(form);
    
    const allErrors = validateInputs(formData);
    
    // Filter errors for the current step
    let stepErrors = [];
    if (currentStep === 1) {
        stepErrors = allErrors.filter(e => e.field === 'sumInsured' || e.field === 'memberCount' || e.field.startsWith('member'));
    } else if (currentStep === 2) {
        stepErrors = allErrors.filter(e => e.field !== 'sumInsured' && e.field !== 'memberCount' && !e.field.startsWith('member'));
    }

    if (stepErrors.length > 0) {
        stepErrors.forEach(err => {
            const errorElement = document.getElementById(`error-${err.field}`);
            if (errorElement) {
                errorElement.textContent = err.message;
                errorElement.style.display = 'block';
            } else {
                // Fallback for fields without specific error span (like radios)
                const input = form.querySelector(`[name="${err.field}"]`);
                if(input) {
                    const group = input.closest('.form-group');
                    if(group) {
                         let errSpan = group.querySelector('.error-msg');
                         if(!errSpan) {
                             errSpan = document.createElement('span');
                             errSpan.className = 'error-msg';
                             group.appendChild(errSpan);
                         }
                         errSpan.textContent = err.message;
                         errSpan.style.display = 'block';
                    }
                }
            }
        });
        showNotification("Please fix the highlighted errors.", "error");
        return false;
    }
    
    if (currentStep === 2) {
        populateSummaryStep(formData);
    }

    return true;
}

function clearErrors() {
    document.querySelectorAll('.error-msg').forEach(el => {
        el.textContent = '';
        el.style.display = 'none';
    });
}

function updateStepUI() {
    // Update active step indicator
    document.querySelectorAll('.step-indicator').forEach((el, index) => {
        if (index + 1 === currentStep) {
            el.classList.add('active');
        } else if (index + 1 < currentStep) {
            el.classList.add('completed');
            el.classList.remove('active');
        } else {
            el.classList.remove('active', 'completed');
        }
    });

    // Update form sections
    document.querySelectorAll('.form-step').forEach((el) => {
        if (parseInt(el.dataset.step) === currentStep) {
            el.classList.remove('hidden');
            // Small delay to allow display:block to apply before animation
            setTimeout(() => el.classList.add('fade-in'), 10);
        } else {
            el.classList.add('hidden');
            el.classList.remove('fade-in');
        }
    });

    // Update progress bar
    const progress = document.getElementById('progress-bar');
    if (progress) {
        progress.style.width = `${((currentStep - 1) / (totalSteps - 1)) * 100}%`;
    }
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function populateSummaryStep(formData) {
    const summaryContainer = document.getElementById('inputs-summary');
    
    let html = `<div class="grid grid-cols-2 gap-4">`;
    
    const memberCount = formData.get('memberCount');
    const sumInsured = formData.get('sumInsured');
    const fmtSi = sumInsured >= 10000000 ? `${sumInsured/10000000} Crore` : `${sumInsured/100000} Lakhs`;
    
    const policyHistoryLabels = {
        'first_time_buyer': 'First-time buyer of Health Insurance',
        '1_yr_old_with_claim': '1 year old policy with claim',
        '1_yr_old_without_claim': '1 year old policy without claim',
        '2_yr_plus_without_claim': '2+ years old policy without claim',
        '2_yr_plus_with_claim_one_yr': '2+ years old policy with claim in any one year',
        '2_yr_plus_with_claim_both_yrs': '2+ years old policy with claim in both years'
    };
    const policyHistoryVal = formData.get('policyHistory');
    const historyText = policyHistoryLabels[policyHistoryVal] || policyHistoryVal;
    
    const deductibleVal = parseInt(formData.get('deductible'), 10);
    const deductibleText = deductibleVal === 0 ? 'None' : `₹${new Intl.NumberFormat('en-IN').format(deductibleVal)}`;

    html += `<div><strong>Sum Insured:</strong> ₹${fmtSi}</div>`;
    html += `<div><strong>Members:</strong> ${memberCount}</div>`;
    html += `<div><strong>Deductible:</strong> ${deductibleText}</div>`;
    html += `<div><strong>All Insured NRI's:</strong> ${formData.get('nri') === 'yes' ? 'Yes' : 'No'}</div>`;
    html += `<div><strong>Porting Policy:</strong> ${formData.get('porting') === 'yes' ? 'Yes' : 'No'}</div>`;
    html += `<div><strong>Existing HDFC Ergo Customer:</strong> ${formData.get('existingCustomer') === 'yes' ? 'Yes' : 'No'}</div>`;
    html += `<div><strong>Claim in last 2 years:</strong> ${formData.get('claim') === 'yes' ? 'Yes' : 'No'}</div>`;
    html += `<div class="col-span-2"><strong>Policy History:</strong> ${historyText}</div>`;
    
    html += `</div><hr class="my-4" />`;
    html += `<h4 class="font-semibold mb-2">Member Details</h4><ul class="list-disc pl-5">`;
    
    for (let i = 1; i <= memberCount; i++) {
        const name = formData.get(`memberName_${i}`) || `Member ${i}`;
        const age = formData.get(`memberAge_${i}`);
        const relation = formData.get(`memberRelation_${i}`);
        const abcd = formData.get(`memberAbcd_${i}`) === 'yes' ? ' [ABCD Chronic]' : '';
        html += `<li>${name} (${relation}), Age: ${age}${abcd}</li>`;
    }
    
    html += `</ul>`;
    summaryContainer.innerHTML = html;
}

function processCalculation() {
    const form = document.getElementById('calculator-form');
    const formData = new FormData(form);
    
    // Extract structured inputs
    const baseInputs = {
        sumInsured: parseInt(formData.get('sumInsured'), 10),
        members: [],
        nri: formData.get('nri') === 'yes',
        deductible: parseInt(formData.get('deductible'), 10),
        policyHistory: formData.get('policyHistory'),
        porting: formData.get('porting') === 'yes',
        existingCustomer: formData.get('existingCustomer') === 'yes',
        claim: formData.get('claim') === 'yes'
    };

    const count = parseInt(formData.get('memberCount'), 10);
    for (let i = 1; i <= count; i++) {
        baseInputs.members.push({
            name: formData.get(`memberName_${i}`),
            age: parseInt(formData.get(`memberAge_${i}`), 10),
            relation: formData.get(`memberRelation_${i}`),
            abcd: formData.get(`memberAbcd_${i}`) === 'yes'
        });
    }

    // Show loading state
    const calcBtn = document.getElementById('calculate-btn');
    const originalText = calcBtn.innerHTML;
    calcBtn.innerHTML = '<span class="spinner"></span> Calculating...';
    calcBtn.disabled = true;

    // Simulate network delay for premium feel
    setTimeout(() => {
        const resultsArray = [];
        for (let t = 1; t <= 5; t++) {
            let inputsForTenure = { ...baseInputs, tenure: t };
            let result = calculatePremium(inputsForTenure, appConfig, appRates);
            result.tenure = t;
            resultsArray.push(result);
        }
        
        renderTenureCards(resultsArray);

        // Inject policy details summary to the final result page for PDF print inclusion
        const summaryHtml = document.getElementById('inputs-summary').innerHTML;
        document.getElementById('final-policy-details').innerHTML = summaryHtml;
        
        currentStep = 4;
        updateStepUI();
        
        showNotification('Premium calculated successfully!', 'success');
        
        calcBtn.innerHTML = originalText;
        calcBtn.disabled = false;
    }, 1200);
}

function renderTenureCards(resultsArray) {
    const container = document.getElementById('tenure-cards-container');
    container.innerHTML = '';
    
    resultsArray.forEach((res, index) => {
        const card = document.createElement('div');
        card.className = `glass-card cursor-pointer p-4 rounded-lg flex-1 min-w-[150px] text-center border-2 transition-all`;
        
        if (index === 0) {
            card.style.borderColor = 'var(--primary)';
            card.style.backgroundColor = 'var(--primary-light)';
        } else {
            card.style.borderColor = 'transparent';
        }

        let discountNote = '';
        if (res.tenure === 2) discountNote = '<div class="text-success text-xs mt-1">Save 6%</div>';
        if (res.tenure >= 3) discountNote = '<div class="text-success text-xs mt-1">Save 8%</div>';

        card.innerHTML = `
            <h4 class="font-bold mb-2">${res.tenure} Year${res.tenure > 1 ? 's' : ''}</h4>
            <div class="font-semibold text-primary" style="font-size: 1.25rem;">${formatCurrency(res.finalPremium)}</div>
            ${discountNote}
        `;
        
        card.addEventListener('click', () => {
            // Update styling
            Array.from(container.children).forEach(c => {
                c.style.borderColor = 'transparent';
                c.style.backgroundColor = '';
            });
            card.style.borderColor = 'var(--primary)';
            card.style.backgroundColor = 'var(--primary-light)';
            
            // Render breakdown
            renderPremiumResult(res);
        });
        
        container.appendChild(card);
    });
    
    // Initial render for year 1
    renderPremiumResult(resultsArray[0]);
}

function renderPremiumResult({ breakdown, finalPremium }) {
    selectedPremium = finalPremium;
    const tableBody = document.getElementById('breakdown-table-body');
    
    tableBody.innerHTML = '';

    // Members base
    breakdown.memberBreakdown.forEach(m => {
        tableBody.innerHTML += `
            <tr>
                <td>Base: ${m.name} (Age ${m.age}, ${m.relation}) <span class="text-muted text-sm ml-2">${m.note || ''}</span></td>
                <td class="text-right">${formatCurrency(m.premium)}</td>
            </tr>
        `;
    });

    // Adjustments
    breakdown.adjustments.forEach(adj => {
        const isDiscount = adj.type === 'discount_amount';
        const isPercent = adj.type === 'discount';
        
        if (isPercent) {
             // We don't render pure percentages as rows, they are grouped in 'Total Discounts'
             return;
        }

        const colorClass = isDiscount ? 'text-success' : 'text-error';
        const sign = isDiscount ? '' : '+'; // discount amount is already negative from engine

        tableBody.innerHTML += `
            <tr>
                <td>${adj.name}</td>
                <td class="text-right ${colorClass}">${sign}${formatCurrency(adj.amount)}</td>
            </tr>
        `;
    });

    // Total Net Premium row
    tableBody.innerHTML += `
        <tr style="font-weight: bold; border-top: 2px solid var(--border); font-size: 1.1rem; background: var(--primary-light-alpha);">
            <td>Total Net Premium</td>
            <td class="text-right text-primary">${formatCurrency(finalPremium)}</td>
        </tr>
    `;
}

function animateNumber(element, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easeProgress = easeOutQuart(progress);
        const currentNumber = Math.floor(easeProgress * (end - start) + start);
        element.innerHTML = formatCurrency(currentNumber);
        
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            // Final pulse animation
            element.classList.add('pulse');
            setTimeout(() => element.classList.remove('pulse'), 500);
        }
    };
    window.requestAnimationFrame(step);
}

function easeOutQuart(x) {
    return 1 - Math.pow(1 - x, 4);
}

function initThemeToggle() {
    const toggle = document.getElementById('theme-toggle');
    const html = document.documentElement;
    
    // Check local storage or system preference
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

function initActionButtons() {
    document.getElementById('edit-btn').addEventListener('click', () => {
        currentStep = 1;
        updateStepUI();
    });

    document.getElementById('reset-btn').addEventListener('click', () => {
        document.getElementById('calculator-form').reset();
        document.getElementById('dynamic-members-container').innerHTML = '';
        clearErrors();
        currentStep = 1;
        updateStepUI();
        showNotification('Form reset successfully.');
    });

    document.getElementById('download-btn').addEventListener('click', downloadPDF);
}

function initHelpModal() {
    const helpBtn = document.getElementById('help-btn');
    const helpModal = document.getElementById('help-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');

    if (helpBtn && helpModal && closeModalBtn) {
        helpBtn.addEventListener('click', () => {
            helpModal.classList.remove('hidden');
        });

        closeModalBtn.addEventListener('click', () => {
            helpModal.classList.add('hidden');
        });

        // Close when clicking outside of modal content
        helpModal.addEventListener('click', (e) => {
            if (e.target === helpModal) {
                helpModal.classList.add('hidden');
            }
        });
    }
}
