# Adult renal calculator age guard

Both renal calculator entry points in `index.html` use the same age gate:
`calculateCrCl()` (adjustment modal) and `calculateInlineCrCl()` (drug card).

- Cockcroft–Gault and automatic CKD-EPI 2021 results require age >=18.
- An entered age below 18 clears CrCl, eGFR and Absolute GFR results and all corresponding dose-table highlights on the next input event. A prominent red warning directs the user to pediatric assessment and references.
- A manual Lab eGFR cannot bypass a known pediatric age. Its input remains intact as a draft, but it is not displayed as an active result or used for highlighting or Absolute GFR.
- BSA remains available as a body-size calculation; it does not select a dose-table row.
- Negative or nonfinite ages are also blocked. Blank age leaves automatic equations unavailable. Existing manual Lab eGFR use without age remains available; this does not establish that the reference applies to a child.
- Clearing inputs removes the age warning and all old highlights. At age 18, the existing adult calculations remain available.

No pediatric equation or pediatric dosing recommendation is added. Adult formula coefficients and reference data are unchanged.

## Basis

NIDDK's [eGFR Calculators for Adults & Pediatrics](https://www.niddk.nih.gov/health-information/professionals/clinical-tools-patient-management/kidney-disease/laboratory-evaluation/estimated-gfr-calculators/adults-pediatrics) specifies age 18 and older for its adult CKD-EPI calculator and separate pediatric equations. The UI restricts both adult calculation routes to adults; it does not automatically substitute a pediatric equation.

## Verification

Browser regression tests use intercepted requests and synthetic fixtures. They cover adult-to-child transitions, manual Lab bypass attempts, ages 0/8/17.99/18, negative age, restoration of adult results, and reset behavior in both entry points. They do not contact the production database.
