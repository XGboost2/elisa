import * as FileSystem from 'expo-file-system';

const DATASET_DIR = `${FileSystem.documentDirectory}elisa_dataset/`;
const ROW_LABELS = 'ABCDEFGH';
const EXPECTED_WELLS = new Set(
    ROW_LABELS.split('').flatMap(row => Array.from({ length: 12 }, (_, i) => `${row}${i + 1}`))
);

async function ensureDir() {
    const info = await FileSystem.getInfoAsync(DATASET_DIR);
    if (!info.exists) {
        await FileSystem.makeDirectoryAsync(DATASET_DIR, { intermediates: true });
    }
}

function recordDir(plateId) {
    return `${DATASET_DIR}${plateId}/`;
}

function metadataPath(plateId) {
    return `${recordDir(plateId)}metadata.json`;
}

function parseNumber(value) {
    const n = Number(String(value || '').trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

function isWell(value) {
    return /^[A-H](?:[1-9]|1[0-2])$/.test(String(value || '').trim().toUpperCase());
}

function parseCsvRows(csvText) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i += 1) {
        const char = csvText[i];
        const next = csvText[i + 1];

        if (char === '"') {
            if (inQuotes && next === '"') {
                cell += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            row.push(cell.trim());
            cell = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && next === '\n') i += 1;
            row.push(cell.trim());
            rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += char;
        }
    }

    if (cell.length || row.length) {
        row.push(cell.trim());
        rows.push(row);
    }
    return rows;
}

function csvCell(value) {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function parseReaderCsv(csvText) {
    const rows = parseCsvRows(csvText);
    const values = {};

    rows.forEach(row => {
        if (row.length >= 2 && isWell(row[0])) {
            const od = parseNumber(row[1]);
            if (od != null) values[row[0].toUpperCase()] = od;
        }
    });
    if (Object.keys(values).length) return values;

    rows.forEach(row => {
        if (row.length < 13) return;
        const rowLabel = row[0].toUpperCase();
        if (!ROW_LABELS.includes(rowLabel)) return;
        for (let i = 0; i < 12; i += 1) {
            const od = parseNumber(row[i + 1]);
            if (od != null) values[`${rowLabel}${i + 1}`] = od;
        }
    });
    if (Object.keys(values).length) return values;

    rows.forEach(row => {
        row.slice(0, -1).forEach((cell, idx) => {
            if (!isWell(cell)) return;
            const od = parseNumber(row[idx + 1]);
            if (od != null) values[cell.toUpperCase()] = od;
        });
    });
    return values;
}

export async function saveDatasetPlateOffline(imageUri, metadata = {}) {
    await ensureDir();
    const plateId = `plate_${Date.now()}`;
    const dir = recordDir(plateId);
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const imagePath = `${dir}plate.jpg`;
    await FileSystem.copyAsync({ from: imageUri, to: imagePath });

    const now = new Date().toISOString();
    const record = {
        plate_id: plateId,
        created_at: now,
        updated_at: now,
        image_path: imagePath,
        image_filename: 'plate.jpg',
        study_name: metadata.study_name || '',
        assay_name: metadata.assay_name || '',
        operator: metadata.operator || '',
        device_model: metadata.device_model || '',
        lighting_condition: metadata.lighting_condition || '',
        chromogen: metadata.chromogen || 'tmb',
        assay_type: metadata.assay_type || 'sandwich',
        notes: metadata.notes || '',
        reader_csv: null,
        reader_values: {},
    };
    await FileSystem.writeAsStringAsync(metadataPath(plateId), JSON.stringify(record, null, 2));
    return record;
}

export async function listDatasetPlatesOffline() {
    await ensureDir();
    const entries = await FileSystem.readDirectoryAsync(DATASET_DIR);
    const plates = [];
    for (const entry of entries) {
        try {
            const raw = await FileSystem.readAsStringAsync(metadataPath(entry));
            const record = JSON.parse(raw);
            plates.push({
                plate_id: record.plate_id,
                created_at: record.created_at,
                study_name: record.study_name,
                assay_name: record.assay_name,
                operator: record.operator,
                device_model: record.device_model,
                chromogen: record.chromogen,
                assay_type: record.assay_type,
                has_reader_csv: Boolean(record.reader_csv),
                reader_wells: Object.keys(record.reader_values || {}).length,
            });
        } catch {
            // Ignore incomplete records.
        }
    }
    plates.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return { plates };
}

export async function attachReaderCsvTextOffline(plateId, csvText) {
    const raw = await FileSystem.readAsStringAsync(metadataPath(plateId));
    const record = JSON.parse(raw);
    const values = parseReaderCsv(csvText);
    if (!Object.keys(values).length) {
        throw new Error('Could not parse any A1-H12 OD values from CSV');
    }
    await FileSystem.writeAsStringAsync(`${recordDir(plateId)}reader_raw.csv`, csvText);
    await FileSystem.writeAsStringAsync(`${recordDir(plateId)}reader_values.json`, JSON.stringify(values, null, 2));
    record.reader_csv = {
        filename: 'pasted_reader.csv',
        stored_filename: 'reader_raw.csv',
        attached_at: new Date().toISOString(),
    };
    record.reader_values = values;
    record.reader_missing_wells = Array.from(EXPECTED_WELLS)
        .filter(well => !Object.prototype.hasOwnProperty.call(values, well))
        .sort();
    record.reader_extra_wells = Object.keys(values)
        .filter(well => !EXPECTED_WELLS.has(well))
        .sort();
    record.updated_at = new Date().toISOString();
    await FileSystem.writeAsStringAsync(metadataPath(plateId), JSON.stringify(record, null, 2));
    return {
        plate_id: plateId,
        parsed_wells: Object.keys(values).length,
        record,
    };
}

export async function exportDatasetManifestOffline() {
    await ensureDir();
    const { plates } = await listDatasetPlatesOffline();
    const lines = [[
        'plate_id', 'well', 'reader_od', 'image_path', 'study_name', 'assay_name',
        'operator', 'device_model', 'lighting_condition', 'chromogen', 'assay_type',
        'created_at', 'notes',
    ].join(',')];

    for (const plate of plates) {
        const raw = await FileSystem.readAsStringAsync(metadataPath(plate.plate_id));
        const record = JSON.parse(raw);
        Object.entries(record.reader_values || {}).forEach(([well, readerOd]) => {
            lines.push([
                record.plate_id,
                well,
                readerOd,
                record.image_path,
                record.study_name,
                record.assay_name,
                record.operator,
                record.device_model,
                record.lighting_condition,
                record.chromogen,
                record.assay_type,
                record.created_at,
                record.notes,
            ].map(csvCell).join(','));
        });
    }
    return lines.join('\n');
}
