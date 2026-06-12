# Future Work: PhD-Level ELISA Analyzer Validation Roadmap

This project should evolve from a working mobile ELISA plate analyzer into a validated measurement system. The core scientific requirement is not only that the app can detect wells and calculate camera-derived OD values, but that those values are repeatable, traceable, and demonstrably comparable to a reference plate reader.

The next phase should focus on validation evidence, reproducible datasets, and formal reporting.

## Scientific Goal

Build and document a camera-based, semi-quantitative ELISA plate analysis system suitable for research use.

The app should be able to answer:

- Does phone-camera OD correlate with reference plate-reader OD?
- How repeatable are measurements from the same phone, plate, and lighting setup?
- How much variation appears across operators, days, phones, and lighting conditions?
- What concentration range is reliable?
- Which calibration model is justified for a given assay?
- When should the app refuse or flag an image as unsuitable?

## Validation Standards To Follow

Use these as methodological references:

- ICH Q2(R2), "Validation of Analytical Procedures", 2023.
  - Relevant concepts: analytical procedure lifecycle, accuracy, precision, range, calibration model, robustness, validation protocol, validation report.
  - Source: https://database.ich.org/sites/default/files/ICH_Q2%28R2%29_Guideline_2023_1130.pdf

- FDA Bioanalytical Method Validation Guidance for Industry, May 2018.
  - Relevant concepts: calibration curves, QC samples, accuracy, precision, bioanalytical assay validation.
  - Source: https://www.fda.gov/regulatory-information/search-fda-guidance-documents/bioanalytical-method-validation-guidance-industry

The app should remain clearly labeled as research-use-only unless a formal clinical/regulatory validation pathway is completed.

## Major Implementation Areas

### 1. Validation Dataset Mode

Add a dedicated workflow for collecting validation data.

Each validation run should store:

- Analysis ID
- Plate image
- App-computed well OD values
- Reference plate-reader OD values, if available
- Assay name
- Assay type: sandwich or competitive
- Chromogen: TMB, OPD, pNPP, ABTS, grayscale
- Plate format: initially 96-well
- Standard/control layout
- Sample layout
- Device model
- Camera settings if accessible
- Lighting condition
- Operator ID or pseudonym
- Capture distance or fixture used
- Date/time
- Notes

Backend storage should support saving raw JSON plus exportable CSV.

Suggested endpoint names:

- `POST /api/validation-runs`
- `GET /api/validation-runs`
- `GET /api/validation-runs/{run_id}`
- `DELETE /api/validation-runs/{run_id}`

### 2. Plate-Reader CSV Import

Add support for importing reference OD data from a laboratory plate reader.

The parser should accept common CSV formats:

- 8 rows x 12 columns
- long format: `well,od`
- vendor-style CSV with metadata rows before the plate table

All parsed data should be normalized to:

```csv
well,reader_od
A1,0.052
A2,0.061
...
H12,1.210
```

The backend should map reader wells to app wells and compute per-well differences:

```csv
well,app_od,reader_od,absolute_error,percent_error
A1,0.050,0.052,0.002,3.85
```

Suggested endpoints:

- `POST /api/validation-runs/{run_id}/reader-csv`
- `GET /api/validation-runs/{run_id}/comparison`

### 3. Agreement Analysis

For each validation run with reader data, compute:

- Pearson correlation
- Spearman correlation
- R-squared against reader OD
- Mean absolute error
- Root mean square error
- Mean bias
- Median bias
- Bland-Altman upper and lower limits of agreement
- Per-well residuals
- Edge-well error vs inner-well error
- Row-wise and column-wise error summaries

The frontend should show:

- App OD vs reader OD scatter plot
- Bland-Altman plot
- Residual heatmap
- Summary table
- Pass/fail interpretation against predefined criteria

Acceptance criteria should be configurable per study. Example starting criteria:

- Pearson r >= 0.95 for OD comparison
- Mean absolute OD error <= 0.05
- Repeatability CV <= 10% for most wells
- Calibration back-calculated concentration error within +/- 20%, or +/- 25% at lower limit

These thresholds must be justified in the thesis and adjusted based on assay context.

### 4. Repeatability Study

Add a repeatability workflow:

- Same plate
- Same phone
- Same lighting
- Same operator
- Multiple captures, e.g. 5-10 images

For each well, calculate:

- Mean app OD
- Standard deviation
- Coefficient of variation percentage
- Minimum and maximum OD
- Repeatability pass/fail

For the whole plate, calculate:

- Median CV%
- 90th percentile CV%
- Number of wells above CV threshold
- Edge vs inner repeatability

Suggested data model:

```json
{
  "study_id": "uuid",
  "type": "repeatability",
  "captures": [
    {
      "analysis_id": "uuid",
      "image_uri": "...",
      "timestamp": "...",
      "device_model": "...",
      "lighting_condition": "fixture_led"
    }
  ]
}
```

Suggested endpoint names:

- `POST /api/validation-studies`
- `POST /api/validation-studies/{study_id}/captures`
- `GET /api/validation-studies/{study_id}/repeatability`

### 5. Intermediate Precision Study

After repeatability works, extend to intermediate precision.

Vary:

- Day
- Operator
- Phone model
- Lighting condition
- Capture fixture
- Plate batch
- Assay batch

Group results by variable and calculate:

- Within-run CV
- Between-day CV
- Between-operator CV
- Between-device bias
- Lighting-condition bias
- Mixed-effects model if enough data exists

This is important for a PhD project because it demonstrates whether the method is robust outside one ideal capture condition.

### 6. Calibration Validation

Improve calibration from "curve fitting" to "validated calibration".

Required backend behavior:

- Require at least 5 positive standards for 4PL.
- Allow blanks but do not pass zero concentration into log or 4PL fitting.
- Store standard positions and concentrations.
- Store QC sample positions separately from standards.
- Calculate back-calculated concentration for each standard.
- Calculate percent recovery/error for each standard.
- Flag standards outside acceptance limits.
- Estimate usable reportable range.
- Estimate lower and upper quantification limits when possible.
- Compare models using residuals and validation criteria, not only R-squared.

Calibration report fields:

- Curve type
- Equation
- Coefficients
- R-squared
- AIC or residual summary if implemented
- Standard residuals
- Back-calculated standard concentrations
- Percent error
- QC recovery
- Selected reportable range
- Warnings

The frontend should show:

- Calibration curve plot
- Residual plot
- Standards table
- QC table
- Model warnings

### 7. Acquisition Standardization

Camera-based quantification depends strongly on image acquisition.

Add image and capture checks:

- Blur/sharpness score
- Brightness score
- Contrast score
- Plate alignment score
- Perspective distortion score
- Overexposure/underexposure detection
- Shadow/lighting uniformity score
- Optional white/reference card correction
- Optional color patch correction

The app should refuse or strongly warn on images that are not suitable for quantitative analysis.

Recommended UI behavior:

- Show "Suitable for quantitative analysis" only when quality gates pass.
- Show exact reasons when failing, e.g. blurry, too dark, tilted, plate too small.
- Store quality metrics with every analysis.

### 8. Physical Capture Fixture

For serious validation, build or specify a simple fixture:

- Fixed phone-to-plate distance
- Fixed angle directly above plate
- Diffuse LED lighting
- Non-reflective background
- Optional white balance/reference card
- Reproducible plate placement

Document fixture dimensions and lighting in the thesis.

Without a controlled fixture, the app can still be useful, but the scientific claims must be weaker.

### 9. Validation Report Generator

Add report generation for validation studies.

Report sections:

- Study title
- Objective
- Assay description
- Device/camera setup
- Capture fixture description
- Plate-reader reference method
- Dataset summary
- Image quality summary
- Calibration model
- Accuracy results
- Precision results
- Reader comparison
- Edge-effect analysis
- Robustness/intermediate precision
- Acceptance criteria
- Pass/fail conclusions
- Limitations
- Research-use-only statement

Export formats:

- HTML first
- PDF later
- CSV/JSON attachments for raw data

Suggested endpoint:

- `GET /api/validation-studies/{study_id}/report`

### 10. Thesis-Ready Dataset Structure

Create a persistent folder structure:

```text
validation_data/
  studies/
    study_id/
      metadata.json
      images/
      app_results/
      reader_results/
      comparisons/
      reports/
```

Example `metadata.json`:

```json
{
  "study_id": "uuid",
  "title": "TMB ELISA smartphone-reader agreement study",
  "assay_name": "Example cytokine ELISA",
  "chromogen": "tmb",
  "assay_type": "sandwich",
  "operator": "operator_01",
  "device_model": "iPhone model",
  "lighting": "fixed LED fixture",
  "plate_reader": "reader model",
  "created_at": "ISO timestamp"
}
```

## Proposed Development Order

1. Add validation run backend models and JSON file storage.
2. Add plate-reader CSV import and parser.
3. Add app-vs-reader comparison metrics.
4. Add validation dashboard screen in the mobile app.
5. Add repeatability study grouping.
6. Add calibration validation tables and residual plots.
7. Add validation report export.
8. Add acquisition quality gates to prevent low-quality analysis.
9. Collect real validation data.
10. Write thesis methods/results around measured performance.

## Minimum Dataset For A Strong First Study

Aim for:

- At least 3 independent plates.
- At least 5-8 standards across the assay range.
- Negative and positive controls on each plate.
- At least 3 QC concentration levels: low, medium, high.
- 5-10 repeated phone captures per plate.
- Reference plate-reader OD for every plate.
- At least 2 lighting conditions, if testing robustness.
- At least 2 phone models, if claiming device robustness.

Minimum analyses:

- App OD vs reader OD correlation.
- Bland-Altman agreement.
- Repeatability CV.
- Calibration back-calculation error.
- QC recovery.
- Edge-effect analysis.

## Important Scientific Limitation

This app should not claim to replace a laboratory plate reader without extensive validation. The correct claim is:

"A smartphone-assisted, camera-based, semi-quantitative ELISA analysis system for research use, with documented agreement and repeatability relative to a reference plate reader under controlled acquisition conditions."

