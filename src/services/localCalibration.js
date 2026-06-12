function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function rSquared(y, yPred) {
    const yMean = mean(y);
    const ssRes = y.reduce((sum, value, i) => sum + (value - yPred[i]) ** 2, 0);
    const ssTot = y.reduce((sum, value) => sum + (value - yMean) ** 2, 0);
    return ssTot < 1e-10 ? 0 : 1 - ssRes / ssTot;
}

function linearFit(x, y) {
    const xMean = mean(x);
    const yMean = mean(y);
    const denom = x.reduce((sum, value) => sum + (value - xMean) ** 2, 0);
    if (Math.abs(denom) < 1e-10) throw new Error('Linear calibration needs varying concentrations');
    const slope = x.reduce((sum, value, i) => sum + (value - xMean) * (y[i] - yMean), 0) / denom;
    const intercept = yMean - slope * xMean;
    const yPred = x.map(value => slope * value + intercept);
    return {
        curve_type: 'linear',
        coefficients: [slope, intercept],
        r_squared: rSquared(y, yPred),
        equation: `OD = ${slope.toFixed(4)} * [C] + ${intercept.toFixed(4)}`,
    };
}

function solve3x3(a, b) {
    const m = a.map((row, i) => [...row, b[i]]);
    for (let i = 0; i < 3; i += 1) {
        let pivot = i;
        for (let r = i + 1; r < 3; r += 1) {
            if (Math.abs(m[r][i]) > Math.abs(m[pivot][i])) pivot = r;
        }
        if (Math.abs(m[pivot][i]) < 1e-10) throw new Error('Polynomial fit is singular');
        [m[i], m[pivot]] = [m[pivot], m[i]];
        const div = m[i][i];
        for (let c = i; c < 4; c += 1) m[i][c] /= div;
        for (let r = 0; r < 3; r += 1) {
            if (r === i) continue;
            const factor = m[r][i];
            for (let c = i; c < 4; c += 1) m[r][c] -= factor * m[i][c];
        }
    }
    return [m[0][3], m[1][3], m[2][3]];
}

function polynomialFit(x, y) {
    const sx = p => x.reduce((sum, value) => sum + value ** p, 0);
    const syx = p => x.reduce((sum, value, i) => sum + y[i] * value ** p, 0);
    const [c, b, a] = solve3x3(
        [
            [x.length, sx(1), sx(2)],
            [sx(1), sx(2), sx(3)],
            [sx(2), sx(3), sx(4)],
        ],
        [syx(0), syx(1), syx(2)]
    );
    const yPred = x.map(value => a * value * value + b * value + c);
    return {
        curve_type: 'polynomial',
        coefficients: [a, b, c],
        r_squared: rSquared(y, yPred),
        equation: `OD = ${a.toExponential(4)}*[C]^2 + ${b.toFixed(4)}*[C] + ${c.toFixed(4)}`,
    };
}

export async function createCalibrationOffline(concentrations, odValues, curveType = 'auto') {
    if (concentrations.length !== odValues.length) {
        throw new Error('Concentrations and OD values must have same length');
    }
    if (concentrations.length < 3) {
        throw new Error('At least 3 calibration points required');
    }

    const pairs = concentrations
        .map((c, i) => ({ c: Number(c), od: Number(odValues[i]) }))
        .filter(p => Number.isFinite(p.c) && Number.isFinite(p.od) && p.c >= 0)
        .sort((a, b) => a.c - b.c);

    if (pairs.length !== concentrations.length) {
        throw new Error('Calibration values must be finite and non-negative');
    }

    const x = pairs.map(p => p.c);
    const y = pairs.map(p => p.od);

    let curve;
    if (curveType === 'linear') {
        curve = linearFit(x, y);
    } else if (curveType === 'polynomial' || curveType === '4pl' || curveType === 'auto') {
        const linear = linearFit(x, y);
        let poly = null;
        try {
            poly = polynomialFit(x, y);
        } catch {
            poly = null;
        }
        curve = curveType === 'linear'
            ? linear
            : curveType === 'polynomial'
                ? (poly || linear)
                : (poly && poly.r_squared > linear.r_squared ? poly : linear);
        if (curveType === '4pl') {
            curve.validation_note = 'Offline mobile mode approximates 4PL with polynomial fitting. Use reader software/backend for final 4PL validation.';
        }
    } else {
        throw new Error(`Unsupported curve type: ${curveType}`);
    }

    return {
        calibration_id: `offline_cal_${Date.now()}`,
        ...curve,
        validation: {
            is_valid: curve.r_squared >= 0.9,
            r_squared: curve.r_squared,
            n_points: x.length,
            curve_type: curve.curve_type,
            equation: curve.equation,
            issues: curve.r_squared < 0.95 ? [`Low R² value (${curve.r_squared.toFixed(3)} < 0.95)`] : null,
        },
    };
}

export async function quantifySamplesOffline(calibration, odValues) {
    const results = odValues.map(od => {
        let concentration = null;
        if (calibration.curve_type === 'linear') {
            const [slope, intercept] = calibration.coefficients;
            if (Math.abs(slope) > 1e-10) concentration = (od - intercept) / slope;
        } else if (calibration.curve_type === 'polynomial') {
            const [a, b, c] = calibration.coefficients;
            const roots = solveQuadratic(a, b, c - od).filter(value => value >= 0);
            concentration = roots.length ? Math.min(...roots) : null;
        }
        if (concentration != null && concentration < 0) concentration = null;
        return {
            od_value: od,
            concentration,
            status: concentration == null ? 'out_of_range' : 'calculated',
        };
    });
    return {
        calibration_id: calibration.calibration_id,
        curve_type: calibration.curve_type,
        equation: calibration.equation,
        r_squared: calibration.r_squared,
        results,
    };
}

function solveQuadratic(a, b, c) {
    if (Math.abs(a) < 1e-10) {
        if (Math.abs(b) < 1e-10) return [];
        return [-c / b];
    }
    const disc = b * b - 4 * a * c;
    if (disc < 0) return [];
    const root = Math.sqrt(disc);
    return [(-b + root) / (2 * a), (-b - root) / (2 * a)];
}
