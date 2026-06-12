import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import jpeg from 'jpeg-js';

const ROW_LABELS = 'ABCDEFGH';
const MAX_ANALYSIS_WIDTH = 1400;

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function mean(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function std(values) {
    if (values.length < 2) return 0;
    const avg = mean(values);
    return Math.sqrt(mean(values.map(value => (value - avg) ** 2)));
}

function chromogenSignal(r, g, b, chromogen) {
    switch (chromogen) {
        case 'opd':
            return Math.max(0, (r + 0.6 * g) - 1.2 * b);
        case 'pnpp':
            return Math.max(0, (r + g) / 2 - b);
        case 'abts':
            return Math.max(0, g - (r + b) / 2);
        case 'grayscale':
            return Math.max(0, 255 - (r + g + b) / 3);
        case 'tmb':
        default:
            return Math.max(0, b - (r + g) / 2);
    }
}

function scoreToOd(signal) {
    return Math.log10(1 + Math.max(signal, 0)) / Math.log10(256) * 2;
}

function csvCell(value) {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function normalizeImageForDecode(imageUri) {
    const manipResult = await ImageManipulator.manipulateAsync(
        imageUri,
        [{ resize: { width: MAX_ANALYSIS_WIDTH } }],
        {
            compress: 0.95,
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true,
        }
    );
    return manipResult.base64;
}

function decodeJpegBase64(base64) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
    const outputLength = Math.floor(clean.length * 3 / 4)
        - (clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0);
    const bytes = new Uint8Array(outputLength);
    let buffer = 0;
    let bits = 0;
    let out = 0;
    for (let i = 0; i < clean.length; i += 1) {
        const char = clean[i];
        if (char === '=') break;
        const value = chars.indexOf(char);
        if (value < 0) continue;
        buffer = (buffer << 6) | value;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            bytes[out] = (buffer >> bits) & 0xff;
            out += 1;
        }
    }
    return jpeg.decode(bytes, { useTArray: true });
}

function sampleCircle(decoded, cx, cy, radius, chromogen) {
    const { width, height, data } = decoded;
    const r2 = radius * radius;
    let count = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;

    const xMin = clamp(Math.floor(cx - radius), 0, width - 1);
    const xMax = clamp(Math.ceil(cx + radius), 0, width - 1);
    const yMin = clamp(Math.floor(cy - radius), 0, height - 1);
    const yMax = clamp(Math.ceil(cy + radius), 0, height - 1);

    for (let y = yMin; y <= yMax; y += 1) {
        for (let x = xMin; x <= xMax; x += 1) {
            const dx = x - cx;
            const dy = y - cy;
            if (dx * dx + dy * dy > r2) continue;
            const idx = (y * width + x) * 4;
            sumR += data[idx];
            sumG += data[idx + 1];
            sumB += data[idx + 2];
            count += 1;
        }
    }

    if (!count) {
        return { r: 0, g: 0, b: 0, signal: 0, od: 0 };
    }

    const r = sumR / count;
    const g = sumG / count;
    const b = sumB / count;
    const signal = chromogenSignal(r, g, b, chromogen);
    return { r, g, b, signal, od: scoreToOd(signal) };
}

function createGrid(width, height) {
    const mx = width * 0.11;
    const my = height * 0.12;
    const rowStep = (height - 2 * my) / 7;
    const colStep = (width - 2 * mx) / 11;
    const rows = Array.from({ length: 8 }, (_, i) => my + i * rowStep);
    const cols = Array.from({ length: 12 }, (_, i) => mx + i * colStep);
    const radius = Math.min(rowStep, colStep) * 0.33;
    return { rows, cols, radius };
}

function assessImageQuality(decoded) {
    const { width, height, data } = decoded;
    const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 50000)));
    const grayValues = [];

    for (let y = 0; y < height; y += stride) {
        for (let x = 0; x < width; x += stride) {
            const idx = (y * width + x) * 4;
            grayValues.push((data[idx] + data[idx + 1] + data[idx + 2]) / 3);
        }
    }

    const brightness = mean(grayValues);
    const contrast = std(grayValues);
    const issues = [
        brightness <= 45 || brightness >= 225 ? 'Image is too dark or overexposed' : null,
        contrast <= 18 ? 'Image has low contrast' : null,
    ].filter(Boolean);

    return {
        brightness,
        contrast,
        sharpness: null,
        is_acceptable: issues.length === 0,
        issues,
    };
}

function detectEdgeEffects(wells) {
    const edge = wells.filter(w => w.is_edge).map(w => w.optical_density);
    const inner = wells.filter(w => !w.is_edge).map(w => w.optical_density);
    const edgeMean = mean(edge);
    const innerMean = mean(inner);
    if (innerMean < 0.001) {
        return {
            detected: false,
            edge_mean_od: edgeMean,
            inner_mean_od: innerMean,
            difference_pct: 0,
        };
    }
    const difference = Math.abs(edgeMean - innerMean) / innerMean * 100;
    return {
        detected: difference > 15,
        edge_mean_od: edgeMean,
        inner_mean_od: innerMean,
        difference_pct: difference,
    };
}

function applyControls(wells, negativeControl, positiveControl, assayType) {
    if (!negativeControl?.length || !positiveControl?.length) return null;

    const neg = wells.filter(w => negativeControl.includes(w.position));
    const pos = wells.filter(w => positiveControl.includes(w.position));
    if (!neg.length || !pos.length) {
        return { applied: false, reason: 'Controls not found on plate' };
    }

    const negOds = neg.map(w => w.optical_density);
    const posOds = pos.map(w => w.optical_density);
    const odNeg = mean(negOds);
    const odPos = mean(posOds);
    const odRange = odPos - odNeg;

    if (Math.abs(odRange) > 0.01) {
        wells.forEach(well => {
            const pct = (well.optical_density - odNeg) / odRange * 100;
            well.normalized_signal = assayType === 'competitive' ? 100 - pct : pct;
        });
    }

    const negStd = std(negOds);
    const cutoff2 = odNeg + 2 * negStd;
    const cutoff3 = odNeg + 3 * negStd;
    const signalToNoise = odNeg > 0.001 ? odPos / odNeg : 9999;

    return {
        applied: true,
        assay_type: assayType,
        negative_control: {
            positions: negativeControl,
            mean_intensity: mean(neg.map(w => w.intensity)),
            mean_od: odNeg,
        },
        positive_control: {
            positions: positiveControl,
            mean_intensity: mean(pos.map(w => w.intensity)),
            mean_od: odPos,
        },
        od_range: odRange,
        signal_to_noise: Math.min(signalToNoise, 9999),
        cutoff_2sd: cutoff2,
        cutoff_3sd: cutoff3,
        qc_passed: odRange > 0.05 && signalToNoise > 2,
        issues: [
            odRange <= 0.05 ? 'Low OD range between controls' : null,
            signalToNoise <= 2 ? 'Poor signal-to-noise ratio' : null,
        ].filter(Boolean),
    };
}

export async function analyzeImageOffline(
    imageUri,
    {
        negativeControl = null,
        positiveControl = null,
        chromogen = 'tmb',
        assayType = 'sandwich',
    } = {}
) {
    const base64 = await normalizeImageForDecode(imageUri);
    const decoded = decodeJpegBase64(base64);
    const { rows, cols, radius } = createGrid(decoded.width, decoded.height);

    const wells = [];
    rows.forEach((y, row) => {
        cols.forEach((x, col) => {
            const sample = sampleCircle(decoded, x, y, radius, chromogen);
            wells.push({
                row,
                col,
                position: `${ROW_LABELS[row]}${col + 1}`,
                center: [x, y],
                rgb_mean: [sample.r, sample.g, sample.b],
                rgb_median: [sample.r, sample.g, sample.b],
                intensity: sample.signal,
                optical_density: sample.od,
                normalized_signal: null,
                is_edge: row === 0 || row === 7 || col === 0 || col === 11,
            });
        });
    });

    const controlQC = applyControls(wells, negativeControl, positiveControl, assayType);
    const timestamp = new Date().toISOString();

    return {
        analysis_id: `offline_${Date.now()}`,
        timestamp,
        success: true,
        offline: true,
        quality: assessImageQuality(decoded),
        plate_detected: true,
        wells_detected: wells.length,
        expected_wells: 96,
        chromogen,
        assay_type: assayType,
        control_qc: controlQC,
        edge_effects: detectEdgeEffects(wells),
        wells,
    };
}

export function resultsToCsv(results) {
    const wells = results.wells || [];
    const wellMap = Object.fromEntries(wells.map(w => [w.position, w]));
    const lines = [];
    lines.push('ELISA Plate Analysis - Offline Research Use Only');
    lines.push(['Analysis ID', results.analysis_id || ''].map(csvCell).join(','));
    lines.push(['Timestamp', results.timestamp || ''].map(csvCell).join(','));
    lines.push(['Chromogen', results.chromogen || ''].map(csvCell).join(','));
    lines.push(['Assay Type', results.assay_type || ''].map(csvCell).join(','));
    lines.push('');
    lines.push(['OD Grid', ...Array.from({ length: 12 }, (_, i) => i + 1)].map(csvCell).join(','));
    ROW_LABELS.split('').forEach(row => {
        lines.push([
            row,
            ...Array.from({ length: 12 }, (_, i) => {
                const well = wellMap[`${row}${i + 1}`];
                return well ? well.optical_density.toFixed(4) : '';
            }),
        ].map(csvCell).join(','));
    });
    lines.push('');
    lines.push('Position,Row,Col,Intensity,OD,Normalized %,Edge Well');
    wells
        .slice()
        .sort((a, b) => a.row - b.row || a.col - b.col)
        .forEach(w => {
            lines.push([
                w.position,
                w.row,
                w.col,
                w.intensity.toFixed(3),
                w.optical_density.toFixed(4),
                w.normalized_signal == null ? '' : w.normalized_signal.toFixed(1),
                w.is_edge ? 'yes' : '',
            ].map(csvCell).join(','));
        });
    return lines.join('\n');
}
