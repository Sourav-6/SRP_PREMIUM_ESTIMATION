export function calculateAdityaBirlaPremium(inputs, config, rates) {
    const { planType, sumInsured, members } = inputs;
    const breakdown = { adjustments: [], memberBreakdown: [] };
    
    // Determine family composition
    let adults = 0;
    let children = 0;
    let eldestAge = 0;

    members.forEach(m => {
        if (m.relation === 'Child') {
            children++;
        } else {
            adults++;
        }
        if (m.age > eldestAge) {
            eldestAge = m.age;
        }
    });

    // Formulate family category key (e.g., '1A', '2A1C')
    let categoryKey = '';
    if (adults === 0) {
        // Edge case: children only policy usually not allowed, but if happens treat as 1A
        adults = 1;
    }
    
    if (adults > 2) {
        throw new Error("Aditya Birla plans only support up to 2 Adults.");
    }
    if (children > 4) {
        throw new Error("Aditya Birla plans only support up to 4 Children.");
    }

    categoryKey = `${adults}A`;
    if (children > 0) {
        categoryKey += `${children}C`;
    }

    // Determine age band
    let ageBand = '';
    if (eldestAge <= 17) ageBand = '5 - 17';
    else if (eldestAge <= 25) ageBand = '18 - 25';
    else if (eldestAge <= 35) ageBand = '26 - 35';
    else if (eldestAge <= 40) ageBand = '36 - 40';
    else if (eldestAge <= 45) ageBand = '41 - 45';
    else if (eldestAge <= 50) ageBand = '46 - 50';
    else if (eldestAge <= 55) ageBand = '51 - 55';
    else if (eldestAge <= 60) ageBand = '56 - 60';
    else if (eldestAge <= 65) ageBand = '61 - 65';
    else if (eldestAge <= 70) ageBand = '66 - 70';
    else if (eldestAge <= 75) ageBand = '71 - 75';
    else ageBand = '75+';

    const siKey = sumInsured.toString();
    const productKey = planType === 'ab_activ_one_max' ? 'activ_one_max' : 'activ_yuva';
    
    const productRates = rates.adityaBirlaRates[productKey];
    if (!productRates) {
        throw new Error(`Rates not found for product: ${productKey}`);
    }

    const categoryRates = productRates[categoryKey];
    if (!categoryRates) {
        throw new Error(`Family combination ${categoryKey} is not supported under this plan.`);
    }

    const siRates = categoryRates[siKey];
    if (!siRates) {
        throw new Error(`Sum Insured ₹${sumInsured} is not available for this family combination.`);
    }

    const basePremium = siRates[ageBand];
    if (!basePremium) {
        throw new Error(`Rate not available for age band ${ageBand}.`);
    }

    // Create the breakdown display
    breakdown.memberBreakdown.push({
        name: `Family (${categoryKey})`,
        age: eldestAge,
        relation: 'Group',
        premium: basePremium,
        note: `(Based on eldest age: ${eldestAge}, Age Band: ${ageBand})`
    });

    breakdown.totalBasePremium = basePremium;

    // As per user requirement: "no other riders right now only consider the zone 3"
    // So we don't apply any other logic for Aditya Birla

    return {
        breakdown,
        finalPremium: basePremium
    };
}
