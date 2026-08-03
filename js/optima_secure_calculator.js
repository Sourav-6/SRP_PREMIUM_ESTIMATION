export function calculateOptimaSecurePremium(inputs, config, rates) {
    const { sumInsured, tenure, members, nri, deductible, policyHistory, porting, existingCustomer, claim, unlimitedRestore, limitlessRider, wellbeingRider } = inputs;
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
            yearPremiums: []
        };
    });

    let totalPremium = 0;
    const siKey = sumInsured.toString();

    // USE optimaSecureBaseRates instead of baseRates
    const baseRatesTable = rates.optimaSecureBaseRates || rates.baseRates;

    for (let y = 1; y <= tenure; y++) {
        membersWithPremium.forEach(member => {
            const currentAge = member.age + (y - 1);
            const ageKey = currentAge.toString(); 
            
            let basePrem = 0;
            if (baseRatesTable[siKey] && baseRatesTable[siKey][ageKey]) {
                basePrem = baseRatesTable[siKey][ageKey];
            } else {
                const availableAges = Object.keys(baseRatesTable[siKey] || {}).map(Number).sort((a,b)=>a-b);
                if (availableAges.length > 0) {
                    const maxAge = availableAges[availableAges.length - 1];
                    basePrem = baseRatesTable[siKey][maxAge.toString()];
                }
            }

            // Apply ABCD Chronic loading
            let abcdLoading = 0;
            if (member.chronic) {
                abcdLoading = basePrem * (rules.abcd_chronic_loading || 0.25);
            }
            let finalBase = basePrem + abcdLoading;
            
            let floaterPrem = finalBase * (1 - member.floaterDiscount);
            member.yearPremiums.push(floaterPrem);
            
            member.totalBase += finalBase;
            member.floaterPremium += floaterPrem;
            totalPremium += floaterPrem;
            
            if (y === 1) {
                let relationLabel = member.relation;
                let memberLabel = `${member.name} (Age ${member.age}, ${relationLabel})`;
                let discountLabel = member.isPrimary ? 'Primary' : `Floater -${+(member.floaterDiscount * 100).toFixed(0)}%`;
                let chronicStr = member.chronic ? ' + 25% Chronic' : '';
                breakdown.memberBreakdown.push({
                    name: `Base Premium: ${memberLabel}`,
                    amount: 0, 
                    note: `(${discountLabel}${chronicStr} × ${tenure} Yrs)`,
                    type: 'base_premium'
                });
            }
        });
    }

    membersWithPremium.forEach((member, i) => {
        breakdown.memberBreakdown[i].amount = Math.round(member.floaterPremium);
    });

    let runningPremium = totalPremium;

    // 3. Deductible Discount
    let deductibleDiscount = 0.0;
    if (deductible > 0) {
        const dedKey = deductible.toString();
        if (rates.deductibleDiscounts[dedKey]) {
            if (sumInsured < 2500000) deductibleDiscount = rates.deductibleDiscounts[dedKey].under_25L;
            else if (sumInsured === 2500000) deductibleDiscount = rates.deductibleDiscounts[dedKey].eq_25L;
            else deductibleDiscount = rates.deductibleDiscounts[dedKey].over_25L;
        }
    }
    
    let deductibleDiscountAmount = Math.round(runningPremium * deductibleDiscount);
    if (deductibleDiscountAmount > 0) {
        breakdown.adjustments.push({ 
            name: `Deductible Discount (-${+(deductibleDiscount * 100).toFixed(2)}%)`, 
            amount: -deductibleDiscountAmount, 
            type: 'discount_amount' 
        });
        runningPremium -= deductibleDiscountAmount;
    }

    // Unlimited Restore Loading
    let restoreLoadingPct = 0.0;
    if (unlimitedRestore) {
        if (sumInsured < 300000) restoreLoadingPct = 0.15;
        else if (sumInsured < 500000) restoreLoadingPct = 0.05;
        else restoreLoadingPct = 0.005;

        let restoreLoadingAmount = Math.round(runningPremium * restoreLoadingPct);
        if (restoreLoadingAmount > 0) {
            breakdown.adjustments.push({ 
                name: `Unlimited Restore Loading (+${+(restoreLoadingPct * 100).toFixed(1)}%)`, 
                amount: restoreLoadingAmount, 
                type: 'loading_amount' 
            });
            runningPremium += restoreLoadingAmount;
        }
    }

    // Limitless Loading
    let limitlessLoadingPct = 0.0;
    if (limitlessRider) {
        if (sumInsured >= 1000000 && sumInsured <= 2500000) limitlessLoadingPct = 0.10;
        else if (sumInsured === 5000000) limitlessLoadingPct = 0.06;
        else if (sumInsured === 7500000) limitlessLoadingPct = 0.03;
        else if (sumInsured === 10000000) limitlessLoadingPct = 0.025; // 1 Cr
        else if (sumInsured >= 20000000) limitlessLoadingPct = 0.015; // 2 Cr

        if (limitlessLoadingPct > 0) {
            let limitlessLoadingAmount = Math.round(runningPremium * limitlessLoadingPct);
            breakdown.adjustments.push({ 
                name: `Limitless Rider Loading (+${+(limitlessLoadingPct * 100).toFixed(1)}%)`, 
                amount: limitlessLoadingAmount, 
                type: 'loading_amount' 
            });
            runningPremium += limitlessLoadingAmount;
        }
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

    // 6. Existing HDFC Ergo Customer Discount
    let existingDiscountPct = existingCustomer ? (rules.loyalty || 0.025) : 0.0;
    let existingDiscountAmount = Math.round(runningPremium * existingDiscountPct);
    if (existingDiscountAmount > 0) {
        breakdown.adjustments.push({ 
            name: `Loyalty Discount (-${+(existingDiscountPct * 100).toFixed(2)}%)`, 
            amount: -existingDiscountAmount, 
            type: 'discount_amount' 
        });
        runningPremium -= existingDiscountAmount;
    }

    // 7. Claim Loading
    let claimLoadingPct = claim ? (0.20) : 0.0;
    let claimLoadingAmount = Math.round(runningPremium * claimLoadingPct);
    if (claimLoadingAmount > 0) {
        breakdown.adjustments.push({ 
            name: `Claim Loading (+${+(claimLoadingPct * 100).toFixed(2)}%)`, 
            amount: claimLoadingAmount, 
            type: 'loading_amount' 
        });
        runningPremium += claimLoadingAmount;
    }

    // Wellbeing Rider
    let wellbeingPremium = 0;
    if (wellbeingRider) {
        let isFloater = members.length > 1;
        let baseWellbeingPremiumPerYear = isFloater ? 1999 : 999;
        
        let totalBaseWellbeing = baseWellbeingPremiumPerYear * tenure;
        
        // Apply existing customer discount (loyalty)
        let wellbeingLoyaltyDiscountAmount = Math.round(totalBaseWellbeing * existingDiscountPct);
        let remainingWellbeing = totalBaseWellbeing - wellbeingLoyaltyDiscountAmount;
        
        breakdown.adjustments.push({ 
            name: `Optima Wellbeing Rider (${tenure} Yrs)`, 
            amount: totalBaseWellbeing, 
            type: 'loading_amount' 
        });
        runningPremium += totalBaseWellbeing;
        
        if (wellbeingLoyaltyDiscountAmount > 0) {
            breakdown.adjustments.push({ 
                name: `Wellbeing Loyalty Discount (-${+(existingDiscountPct * 100).toFixed(2)}%)`, 
                amount: -wellbeingLoyaltyDiscountAmount, 
                type: 'discount_amount' 
            });
            runningPremium -= wellbeingLoyaltyDiscountAmount;
        }
    }

    // 8. Favourable Claims Discount (for members under 60 in that policy year)
    let totalClaimsDiscountAmount = 0;
    for (let y = 1; y <= tenure; y++) {
        let r_y = getClaimsDiscountRate(policyHistory, y);
        if (r_y > 0) {
            membersWithPremium.forEach(member => {
                if (member.age + (y - 1) < 60) {
                    let memberYearPrem = member.yearPremiums[y - 1];
                    let memberPremSeq = memberYearPrem * (1 - deductibleDiscount) * (1 + restoreLoadingPct) * (1 + limitlessLoadingPct) * (1 - nriDiscountPct) * (1 - lifetimeDiscountPct) * (1 - existingDiscountPct) * (1 + claimLoadingPct);
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

    // 9. Long Term Tenure Discount
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
