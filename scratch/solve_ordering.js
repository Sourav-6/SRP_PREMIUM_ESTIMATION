// Inline solver without imports

// HDFC Ergo target net premiums (excluding 18% GST):
// 50K Deductible (40% discount) -> 18691 / 1.18 = 15839.83 -> target ~15840
// 1L Deductible (50% discount)  -> 15910 / 1.18 = 13483.05 -> target ~13483
// 2L Deductible (55% discount)  -> 14518 / 1.18 = 12303.39 -> target ~12303

const targets = {
    50000: 15840,
    100000: 13483,
    200000: 12303
};

const baseRates = {
    42: 18605,
    37: 17007,
    7: 10455,
    2: 9450
};

// We will try different orderings of:
// - Floater Discount (F = 55% for subsequent members)
// - Deductible Discount (D = 40%, 50%, 55%)
// - Favourable Claims Discount (C = 21% for all members)
// We will test if rounding at each step or at the end matches targets.

const members = [18605, 17007, 10455, 9450]; // sorted descending

console.log("Searching for calculation model that matches HDFC Ergo bot outputs...");

// Strategy 1: Standard Floater then individual Deductible then Claims
function testStrategy1(dedPct) {
    // 1. Floater
    let primary = members[0];
    let floaterSum = primary + Math.round(members[1] * 0.45) + Math.round(members[2] * 0.45) + Math.round(members[3] * 0.45);
    // 2. Deductible discount
    let dedAmt = Math.round(floaterSum * dedPct);
    let afterDed = floaterSum - dedAmt;
    // 3. Claims
    let claimAmt = Math.round(afterDed * 0.21);
    let finalNet = afterDed - claimAmt;
    return finalNet;
}

// Strategy 2: Individual Deductible discount then Floater then Claims
function testStrategy2(dedPct) {
    let primary = Math.round(members[0] * (1 - dedPct));
    let f1 = Math.round(members[1] * (1 - dedPct));
    let f2 = Math.round(members[2] * (1 - dedPct));
    let f3 = Math.round(members[3] * (1 - dedPct));
    
    let floaterSum = primary + Math.round(f1 * 0.45) + Math.round(f2 * 0.45) + Math.round(f3 * 0.45);
    let claimAmt = Math.round(floaterSum * 0.21);
    let finalNet = floaterSum - claimAmt;
    return finalNet;
}

// Strategy 3: Floater then Deductible on each member then Claims on each member
function testStrategy3(dedPct) {
    let primary = Math.round(members[0] * 1.0);
    let f1 = Math.round(members[1] * 0.45);
    let f2 = Math.round(members[2] * 0.45);
    let f3 = Math.round(members[3] * 0.45);
    
    let p_net = Math.round(primary * (1 - dedPct) * (1 - 0.21));
    let f1_net = Math.round(f1 * (1 - dedPct) * (1 - 0.21));
    let f2_net = Math.round(f2 * (1 - dedPct) * (1 - 0.21));
    let f3_net = Math.round(f3 * (1 - dedPct) * (1 - 0.21));
    
    return p_net + f1_net + f2_net + f3_net;
}

// Strategy 4: What if Favourable Claims discount is NOT 21% for children?
// What if it is 0% or different for children, or what if only primary gets it?
// Let's test different claim discount applications.

console.log("\nStrategy 1 (Floater -> Deductible -> Claims at family level):");
for (let d of [50000, 100000, 200000]) {
    let pct = d === 50000 ? 0.40 : (d === 100000 ? 0.50 : 0.55);
    console.log(`  Deductible ${d}: Got = ${testStrategy1(pct)}, Target = ${targets[d]}, Diff = ${testStrategy1(pct) - targets[d]}`);
}

console.log("\nStrategy 2 (Individual Deductible -> Floater -> Claims):");
for (let d of [50000, 100000, 200000]) {
    let pct = d === 50000 ? 0.40 : (d === 100000 ? 0.50 : 0.55);
    console.log(`  Deductible ${d}: Got = ${testStrategy2(pct)}, Target = ${targets[d]}, Diff = ${testStrategy2(pct) - targets[d]}`);
}

console.log("\nStrategy 3 (Floater -> Individual Deductible -> Individual Claims):");
for (let d of [50000, 100000, 200000]) {
    let pct = d === 50000 ? 0.40 : (d === 100000 ? 0.50 : 0.55);
    console.log(`  Deductible ${d}: Got = ${testStrategy3(pct)}, Target = ${targets[d]}, Diff = ${testStrategy3(pct) - targets[d]}`);
}
