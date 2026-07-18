/**
 * Health Insurance Premium Calculation Engine - Optima Secure
 * Uses exact rates and discount logic from Excel data.
 */

export function calculatePremium(inputs, config, rates) {
    const { sumInsured, tenure, members, nri, deductible, policyHistory, porting, existingCustomer, claim } = inputs;
    const rules = rates.discountRules;
    const breakdown = { adjustments: [], memberBreakdown: [] };
    
    // Helper function to resolve Favourable Claims discount rate
    function getClaimsDiscountRate(history, year) {
        const rule = rates.discountRules.favourable_claims[history];
        if (!rule) return 0.0;
        if (rule.year_1_to_5 !== undefined) return rule.year_1_to_5;
        if (year === 1 && rule.year_1 !== undefined) return rule.year_1;
        if (year === 2 && rule.year_2 !== undefined) return rule.year_2;
        if (year >= 3 && rule.year_3_to_5 !== undefined) return rule.year_3_to_5;
        if (year >= 2 && rule.year_2_to_5 !== undefined) return rule.year_2_to_5;
        return 0.0;
    }

    // 1. Calculate Base Premium per member (including ABCD Loading)
    let membersWithPremium = members.map(member => {
        // Find base premium from rates JSON (keys are strings)
        const siKey = sumInsured.toString();
        const ageKey = member.age.toString(); 
        
        let basePrem = 0;
        if (rates.baseRates[siKey] && rates.baseRates[siKey][ageKey]) {
            basePrem = rates.baseRates[siKey][ageKey];
        } else {
            // Fallback: try highest available age if not found (just in case)
            const availableAges = Object.keys(rates.baseRates[siKey]).map(Number).sort((a,b)=>a-b);
            const maxAge = availableAges[availableAges.length - 1];
            basePrem = rates.baseRates[siKey][maxAge.toString()];
        }

        // Apply ABCD Chronic loading
        let abcdLoading = 0;
        if (member.abcd) {
            abcdLoading = basePrem * rules.abcd_chronic_loading;
        }

        return {
            ...member,
            base: basePrem,
            abcdLoading: abcdLoading,
            totalBase: basePrem + abcdLoading
        };
    });

    // 2. Floater Discount Logic
    // Sort members by age descending. Oldest pays 100%, others get 55% discount.
    membersWithPremium.sort((a, b) => b.age - a.age);
    
    let annualFamilyBasePremium = 0;
    
    membersWithPremium.forEach((member, index) => {
        let isPrimary = index === 0;
        let floaterDiscount = isPrimary ? 0 : rules.floater_subsequent_member; // 55%
        
        let finalMemberPrem = Math.round(member.totalBase * (1 - floaterDiscount));
        member.floaterPremium = finalMemberPrem;
        annualFamilyBasePremium += finalMemberPrem;
        
        // Scale individual base premiums by the selected policy tenure for the breakdown
        let tenurePremium = finalMemberPrem * tenure;
        
        // Add to UI breakdown
        breakdown.memberBreakdown.push({
            name: member.name || `${member.relation}`,
            age: member.age,
            relation: member.relation,
            premium: tenurePremium,
            note: isPrimary ? `(Primary × ${tenure} Yr${tenure > 1 ? 's' : ''})` : `(Floater -${Math.round(floaterDiscount*100)}% × ${tenure} Yr${tenure > 1 ? 's' : ''})`
        });
    });

    // Multi-year total base (before overall policy discounts)
    let totalPremium = annualFamilyBasePremium * tenure;
    breakdown.totalBasePremium = totalPremium;
    
    let runningPremium = totalPremium;

    // 3. Deductible Discount
    let deductibleDiscount = 0.0;
    if (deductible > 0) {
        let tier = 'over_25L';
        if (sumInsured < 2500000) tier = 'under_25L';
        else if (sumInsured === 2500000) tier = 'eq_25L';
        
        if (rates.deductibleDiscounts[deductible.toString()]) {
            deductibleDiscount = rates.deductibleDiscounts[deductible.toString()][tier] || 0.0;
        }
    }
    
    let deductibleDiscountAmount = Math.round(totalPremium * deductibleDiscount);
    if (deductibleDiscountAmount > 0) {
        breakdown.adjustments.push({ 
            name: `Deductible Discount (-${+(deductibleDiscount * 100).toFixed(2)}%)`, 
            amount: -deductibleDiscountAmount, 
            type: 'discount_amount' 
        });
        runningPremium -= deductibleDiscountAmount;
    }

    // 4. NRI Discount
    let nriDiscountPct = nri ? (rules.nri || 0.40) : 0.0;
    let nriDiscountAmount = Math.round(runningPremium * nriDiscountPct);
    if (nriDiscountAmount > 0) {
        breakdown.adjustments.push({ 
            name: `NRI Discount (-${+(nriDiscountPct * 100).toFixed(2)}%)`, 
            amount: -nriDiscountAmount, 
            type: 'discount_amount' 
        });
        runningPremium -= nriDiscountAmount;
    }

    // 5. Lifetime Discount (All members 35 or less)
    let isAllUnder35 = membersWithPremium.every(m => m.age <= 35);
    let lifetimeDiscountPct = isAllUnder35 ? (rules.lifetime_under_35 || 0.05) : 0.0;
    let lifetimeDiscountAmount = Math.round(runningPremium * lifetimeDiscountPct);
    if (lifetimeDiscountAmount > 0) {
        breakdown.adjustments.push({ 
            name: `Lifetime Discount (-${+(lifetimeDiscountPct * 100).toFixed(2)}%)`, 
            amount: -lifetimeDiscountAmount, 
            type: 'discount_amount' 
        });
        runningPremium -= lifetimeDiscountAmount;
    }

    // Porting Discount removed

    // 6c. Existing HDFC Ergo Customer Discount
    let existingDiscountPct = existingCustomer ? (config.existingCustomerDiscount || 0.08) : 0.0;
    let existingDiscountAmount = Math.round(runningPremium * existingDiscountPct);
    if (existingDiscountAmount > 0) {
        breakdown.adjustments.push({ 
            name: `Existing Customer Discount (-${+(existingDiscountPct * 100).toFixed(2)}%)`, 
            amount: -existingDiscountAmount, 
            type: 'discount_amount' 
        });
        runningPremium -= existingDiscountAmount;
    }

    // 6d. Claim Loading
    let claimLoadingPct = claim ? (config.claimLoading || 0.20) : 0.0;
    let claimLoadingAmount = Math.round(runningPremium * claimLoadingPct);
    if (claimLoadingAmount > 0) {
        breakdown.adjustments.push({ 
            name: `Claim Loading (+${+(claimLoadingPct * 100).toFixed(2)}%)`, 
            amount: claimLoadingAmount, 
            type: 'loading_amount' 
        });
        runningPremium += claimLoadingAmount;
    }

    // 7. Favourable Claims Discount (for members under 60)
    let totalClaimsDiscountAmount = 0;
    for (let y = 1; y <= tenure; y++) {
        let r_y = getClaimsDiscountRate(policyHistory, y);
        if (r_y > 0) {
            membersWithPremium.forEach(member => {
                if (member.age < 60) {
                    // Apply preceding sequential adjustments to the member's floater premium
                    let memberPremSeq = member.floaterPremium * (1 - deductibleDiscount) * (1 - nriDiscountPct) * (1 - lifetimeDiscountPct) * (1 - existingDiscountPct) * (1 + claimLoadingPct);
                    totalClaimsDiscountAmount += memberPremSeq * r_y;
                }
            });
        }
    }
    
    let roundedClaimsDiscountAmount = Math.round(totalClaimsDiscountAmount);
    if (roundedClaimsDiscountAmount > 0) {
        breakdown.adjustments.push({ 
            name: 'Favourable Claims Discount', 
            amount: -roundedClaimsDiscountAmount, 
            type: 'discount_amount' 
        });
        runningPremium -= roundedClaimsDiscountAmount;
    }

    // 8. Long Term Tenure Discount
    let tenureDiscount = (tenure === 2) ? (rules.long_term_2_yr || 0.06) : (tenure >= 3 ? (rules.long_term_3_to_5_yr || 0.08) : 0.0);
    let tenureDiscountAmount = Math.round(runningPremium * tenureDiscount);
    if (tenureDiscountAmount > 0) {
        breakdown.adjustments.push({ 
            name: `Long Term Discount (${tenure} Yrs, -${+(tenureDiscount * 100).toFixed(2)}%)`, 
            amount: -tenureDiscountAmount, 
            type: 'discount_amount' 
        });
        runningPremium -= tenureDiscountAmount;
    }

    return {
        breakdown,
        finalPremium: Math.round(runningPremium)
    };
}
