/**
 * Validates the inputs from the health insurance calculator form.
 * @param {Object} formData - Form data extracted from the UI
 * @returns {Array} errors - Array of error objects { field, message }
 */
export function validateInputs(formData) {
    const errors = [];

    // Validate members count
    const memberCount = parseInt(formData.get('memberCount'), 10);
    if (isNaN(memberCount) || memberCount < 1 || memberCount > 10) {
        errors.push({ field: 'memberCount', message: 'Please select between 1 and 10 members.' });
    }

    let hasOver60 = false;
    // Validate each member's age
    for (let i = 1; i <= memberCount; i++) {
        const ageField = formData.get(`memberAge_${i}`);
        const age = parseInt(ageField, 10);
        if (!ageField || isNaN(age) || age < 1) {
            errors.push({ field: `memberAge_${i}`, message: 'Age is required and must be a valid number.' });
        } else if (age > 100) {
            errors.push({ field: `memberAge_${i}`, message: 'Maximum eligible age is 100 years.' });
        }
    }

    if (!formData.get('sumInsured')) {
        errors.push({ field: 'sumInsured', message: 'Please select a Sum Insured.' });
    }

    return errors;
}
