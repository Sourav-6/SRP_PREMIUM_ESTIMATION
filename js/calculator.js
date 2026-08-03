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

    // 1 & 2. Calculate Base Premium per member over the tenure (Age Progression)
    // Sort members by age descending. Oldest pays 100%, others get 55% discount.
    let sortedMembers = [...members].sort((a, b) => b.age - a.age);
    
    let membersWithPremium = sortedMembers.map((member, index) => {
        let isPrimary = index === 0;
        let floaterDiscount = isPrimary ? 0 : rules.floater_subsequent_member;
        
        return {
            ...member,
            isPrimary,
            floaterDiscount,
            totalBase: 0,
            floaterPremium: 0,
            yearPremiums: [] // Store each year's premium for Favourable Claims calculation
        };
    });

    let totalPremium = 0;
    const siKey = sumInsured.toString();

    for (let y = 1; y <= tenure; y++) {
        membersWithPremium.forEach(member => {
            const currentAge = member.age + (y - 1);
            const ageKey = currentAge.toString(); 
            
            let basePrem = 0;
            if (rates.baseRates[siKey] && rates.baseRates[siKey][ageKey]) {
                basePrem = rates.baseRates[siKey][ageKey];
            } else {
                // Fallback: try highest available age if not found
                const availableAges = Object.keys(rates.baseRates[siKey]).map(Number).sort((a,b)=>a-b);
                const maxAge = availableAges[availableAges.length - 1];
                basePrem = rates.baseRates[siKey][maxAge.toString()];
            }

            // Apply ABCD Chronic loading
            let abcdLoading = 0;
            if (member.abcd) {
                abcdLoading = basePrem * rules.abcd_chronic_loading;
            }

            let totalBaseForYear = basePrem + abcdLoading;
            let finalMemberPremForYear = Math.round(totalBaseForYear * (1 - member.floaterDiscount));
            
            member.totalBase += totalBaseForYear;
            member.floaterPremium += finalMemberPremForYear;
            member.yearPremiums.push(finalMemberPremForYear);
            
            totalPremium += finalMemberPremForYear;
        });
    }

    // Add to UI breakdown
    membersWithPremium.forEach(member => {
        breakdown.memberBreakdown.push({
            name: `Base Premium: ${member.name || member.relation} (Age ${member.age}, ${member.relation})`,
            amount: member.floaterPremium,
            note: member.isPrimary ? `(Primary × ${tenure} Yr${tenure > 1 ? 's' : ''})` : `(Floater -${Math.round(member.floaterDiscount*100)}% × ${tenure} Yr${tenure > 1 ? 's' : ''})`,
            type: 'base_premium'
        });
    });

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

    // Mandatory 20% Co-payment for Age > 60
    let hasOver60 = membersWithPremium.some(m => m.age > 60);
    let age60DiscountPct = hasOver60 ? 0.20 : 0.0;
    let age60DiscountAmount = Math.round(runningPremium * age60DiscountPct);
    if (age60DiscountAmount > 0) {
        breakdown.adjustments.push({ 
            name: `Mandatory 20% Co-pay Discount (Age > 60)`, 
            amount: -age60DiscountAmount, 
            type: 'discount_amount' 
        });
        runningPremium -= age60DiscountAmount;
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

    // 7. Favourable Claims Discount (for members under 60 in that policy year)
    let totalClaimsDiscountAmount = 0;
    for (let y = 1; y <= tenure; y++) {
        let r_y = getClaimsDiscountRate(policyHistory, y);
        if (r_y > 0) {
            membersWithPremium.forEach(member => {
                if (member.age + (y - 1) < 60) {
                    // Apply preceding sequential adjustments to the member's specific year premium
                    let memberYearPrem = member.yearPremiums[y - 1];
                    let memberPremSeq = memberYearPrem * (1 - deductibleDiscount) * (1 - nriDiscountPct) * (1 - lifetimeDiscountPct) * (1 - existingDiscountPct) * (1 + claimLoadingPct);
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
