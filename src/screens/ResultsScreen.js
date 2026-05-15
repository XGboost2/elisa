/**
 * Results screen — two phases:
 *   1. Control Setup: user marks negative + positive control wells on a mini grid
 *   2. Analysis Results: heatmap, OD values, control QC, link to calibration
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Image,
    Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import theme from '../styles/theme';
import { analyzeImage, exportResults } from '../services/apiClient';
import WellHeatmap, { getColorFromOD } from '../components/WellHeatmap';

const ROW_LABELS = 'ABCDEFGH';

// --- Control-selection mini-grid (phase 1) -----------------------------------

const CHROMOGENS = [
    { value: 'tmb', label: 'TMB (blue, 450nm)' },
    { value: 'opd', label: 'OPD (orange, 492nm)' },
    { value: 'pnpp', label: 'pNPP (yellow, 405nm)' },
    { value: 'abts', label: 'ABTS (green, 405nm)' },
];

const ASSAY_TYPES = [
    { value: 'sandwich', label: 'Sandwich' },
    { value: 'competitive', label: 'Competitive' },
];

function ControlSetupGrid({ onSubmit }) {
    const [negWells, setNegWells] = useState(new Set());
    const [posWells, setPosWells] = useState(new Set());
    const [mode, setMode] = useState('neg'); // 'neg' | 'pos'
    const [chromogen, setChromogen] = useState('tmb');
    const [assayType, setAssayType] = useState('sandwich');

    const toggle = useCallback((pos) => {
        if (mode === 'neg') {
            setNegWells(prev => {
                const next = new Set(prev);
                if (next.has(pos)) next.delete(pos);
                else next.add(pos);
                // remove from the other set
                setPosWells(p => { const n = new Set(p); n.delete(pos); return n; });
                return next;
            });
        } else {
            setPosWells(prev => {
                const next = new Set(prev);
                if (next.has(pos)) next.delete(pos);
                else next.add(pos);
                setNegWells(p => { const n = new Set(p); n.delete(pos); return n; });
                return next;
            });
        }
    }, [mode]);

    const canSubmit = negWells.size > 0 && posWells.size > 0;

    return (
        <View style={styles.card}>
            <Text style={styles.cardTitle}>Select Controls</Text>
            <Text style={styles.cardSubtitle}>
                Tap wells to mark negative (blank) and positive controls
            </Text>

            {/* Mode toggle */}
            <View style={controlStyles.modeRow}>
                <TouchableOpacity
                    style={[controlStyles.modeBtn, mode === 'neg' && controlStyles.modeBtnNegActive]}
                    onPress={() => setMode('neg')}
                >
                    <Text style={[controlStyles.modeBtnText, mode === 'neg' && controlStyles.modeBtnTextActive]}>
                        – Negative ({negWells.size})
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[controlStyles.modeBtn, mode === 'pos' && controlStyles.modeBtnPosActive]}
                    onPress={() => setMode('pos')}
                >
                    <Text style={[controlStyles.modeBtnText, mode === 'pos' && controlStyles.modeBtnTextActive]}>
                        + Positive ({posWells.size})
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Grid */}
            <View style={controlStyles.gridContainer}>
                <View style={controlStyles.gridRow}>
                    <View style={controlStyles.gridLabel} />
                    {Array.from({ length: 12 }).map((_, i) => (
                        <View key={i} style={controlStyles.gridLabel}>
                            <Text style={controlStyles.gridLabelText}>{i + 1}</Text>
                        </View>
                    ))}
                </View>
                {Array.from({ length: 8 }).map((_, ri) => (
                    <View key={ri} style={controlStyles.gridRow}>
                        <View style={controlStyles.gridLabel}>
                            <Text style={controlStyles.gridLabelText}>{ROW_LABELS[ri]}</Text>
                        </View>
                        {Array.from({ length: 12 }).map((_, ci) => {
                            const pos = `${ROW_LABELS[ri]}${ci + 1}`;
                            const isNeg = negWells.has(pos);
                            const isPos = posWells.has(pos);
                            return (
                                <TouchableOpacity
                                    key={ci}
                                    style={[
                                        controlStyles.cell,
                                        isNeg && controlStyles.cellNeg,
                                        isPos && controlStyles.cellPos,
                                    ]}
                                    onPress={() => toggle(pos)}
                                >
                                    <Text style={controlStyles.cellText}>
                                        {isNeg ? '–' : isPos ? '+' : ''}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                ))}
            </View>

            {/* Chromogen selector */}
            <Text style={[controlStyles.sectionLabel, { marginTop: theme.spacing.md }]}>Chromogen</Text>
            <View style={controlStyles.chipRow}>
                {CHROMOGENS.map(c => (
                    <TouchableOpacity
                        key={c.value}
                        style={[controlStyles.chip, chromogen === c.value && controlStyles.chipActive]}
                        onPress={() => setChromogen(c.value)}
                    >
                        <Text style={[controlStyles.chipText, chromogen === c.value && controlStyles.chipTextActive]}>
                            {c.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Assay type selector */}
            <Text style={controlStyles.sectionLabel}>Assay Type</Text>
            <View style={controlStyles.chipRow}>
                {ASSAY_TYPES.map(a => (
                    <TouchableOpacity
                        key={a.value}
                        style={[controlStyles.chip, assayType === a.value && controlStyles.chipActive]}
                        onPress={() => setAssayType(a.value)}
                    >
                        <Text style={[controlStyles.chipText, assayType === a.value && controlStyles.chipTextActive]}>
                            {a.label}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Submit */}
            <TouchableOpacity
                style={[styles.button, !canSubmit && { opacity: 0.4 }]}
                onPress={() => canSubmit && onSubmit([...negWells], [...posWells], chromogen, assayType)}
                disabled={!canSubmit}
            >
                <Text style={styles.buttonText}>Analyze with Controls</Text>
            </TouchableOpacity>

            {/* Skip option */}
            <TouchableOpacity
                style={[styles.button, styles.buttonSecondary, { marginTop: theme.spacing.xs }]}
                onPress={() => onSubmit(null, null, chromogen, assayType)}
            >
                <Text style={styles.buttonTextSecondary}>Skip (no controls)</Text>
            </TouchableOpacity>
        </View>
    );
}

// --- Main screen -------------------------------------------------------------

export default function ResultsScreen({ route, navigation }) {
    const { imageUri } = route.params;
    const [phase, setPhase] = useState('controls'); // 'controls' | 'loading' | 'done'
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        return () => { mountedRef.current = false; };
    }, []);

    const runAnalysis = useCallback(async (negativeControl, positiveControl, chromogen, assayType) => {
        setPhase('loading');
        setError(null);

        try {
            const opts = {};
            if (negativeControl) opts.negativeControl = negativeControl;
            if (positiveControl) opts.positiveControl = positiveControl;
            if (chromogen) opts.chromogen = chromogen;
            if (assayType) opts.assayType = assayType;

            const data = await analyzeImage(imageUri, opts);
            if (mountedRef.current) {
                setResults(data);
                setPhase('done');
            }
        } catch (err) {
            console.error('ResultsScreen error:', err);
            const msg =
                typeof err === 'string' ? err :
                err instanceof Error ? err.message :
                err?.message ?? String(err);
            if (mountedRef.current) {
                setError(msg);
                setPhase('done');
            }
        }
    }, [imageUri]);

    // --- Phase: control selection ---
    if (phase === 'controls') {
        return (
            <ScrollView style={styles.scrollView}>
                <StatusBar style="dark" />
                <View style={styles.header}>
                    <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                        <Text style={styles.backText}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Plate Setup</Text>
                    <View style={styles.spacer} />
                </View>

                <View style={styles.imageContainer}>
                    <Image source={{ uri: imageUri }} style={styles.image} />
                </View>

                <ControlSetupGrid onSubmit={runAnalysis} />

                <View style={styles.bottomSpacer} />
            </ScrollView>
        );
    }

    // --- Phase: loading ---
    if (phase === 'loading') {
        return (
            <View style={styles.container}>
                <StatusBar style="dark" />
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Analyzing ELISA plate...</Text>
                <Text style={styles.loadingSubtext}>
                    Detecting grid and calculating optical density
                </Text>
            </View>
        );
    }

    // --- Phase: error ---
    if (error) {
        return (
            <View style={styles.container}>
                <StatusBar style="dark" />
                <Text style={styles.errorTitle}>Analysis Failed</Text>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
                    <Text style={styles.buttonText}>Go Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.button, styles.buttonSecondary]}
                    onPress={() => setPhase('controls')}
                >
                    <Text style={styles.buttonTextSecondary}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // --- Phase: no plate ---
    if (!results || !results.success) {
        return (
            <View style={styles.container}>
                <StatusBar style="dark" />
                <Text style={styles.errorTitle}>No Plate Detected</Text>
                <Text style={styles.errorText}>
                    {results?.error || 'Could not detect ELISA plate in the image.'}
                </Text>
                <Text style={styles.hintText}>
                    Please ensure:
                    {'\n'}• The plate is clearly visible
                    {'\n'}• Good lighting without shadows
                    {'\n'}• Camera is positioned directly above
                </Text>
                <TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}>
                    <Text style={styles.buttonText}>Try Again</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const handleExportCSV = async () => {
        try {
            if (!results.analysis_id) {
                Alert.alert('Export', 'No analysis ID available for export.');
                return;
            }
            const csvData = await exportResults(results.analysis_id);
            const fileUri = FileSystem.documentDirectory + `elisa_${results.analysis_id}.csv`;
            await FileSystem.writeAsStringAsync(fileUri, csvData);
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, { mimeType: 'text/csv' });
            } else {
                Alert.alert('Exported', `Saved to ${fileUri}`);
            }
        } catch (err) {
            Alert.alert('Export Error', err.message);
        }
    };

    // --- Phase: results ---
    const wells = results.wells || [];
    const controlQC = results.control_qc;
    const edgeEffects = results.edge_effects;
    const cutoff = results.control_qc?.cutoff_2sd;
    const cutoff3 = results.control_qc?.cutoff_3sd;
    const odRange = wells.length > 0
        ? wells.reduce(
            (acc, w) => ({
                min: Math.min(acc.min, w.optical_density),
                max: Math.max(acc.max, w.optical_density),
            }),
            { min: Infinity, max: -Infinity }
        )
        : { min: 0, max: 1 };

    return (
        <ScrollView style={styles.scrollView}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => navigation.navigate('Home')}
                >
                    <Text style={styles.backText}>← Home</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Analysis Results</Text>
                <View style={styles.spacer} />
            </View>

            {/* Image preview */}
            <View style={styles.imageContainer}>
                <Image source={{ uri: imageUri }} style={styles.image} />
            </View>

            {/* Control QC card */}
            {controlQC && controlQC.applied && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Control QC</Text>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Neg control OD:</Text>
                        <Text style={styles.summaryValue}>
                            {controlQC.negative_control.mean_od.toFixed(3)}
                        </Text>
                    </View>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Pos control OD:</Text>
                        <Text style={styles.summaryValue}>
                            {controlQC.positive_control.mean_od.toFixed(3)}
                        </Text>
                    </View>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>OD range:</Text>
                        <Text style={styles.summaryValue}>
                            {controlQC.od_range.toFixed(3)}
                        </Text>
                    </View>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Signal / Noise:</Text>
                        <Text style={[
                            styles.summaryValue,
                            controlQC.signal_to_noise > 2 ? styles.successText : styles.warningText,
                        ]}>
                            {controlQC.signal_to_noise.toFixed(1)}x
                        </Text>
                    </View>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>QC:</Text>
                        <Text style={[
                            styles.summaryValue,
                            controlQC.qc_passed ? styles.successText : styles.warningText,
                        ]}>
                            {controlQC.qc_passed ? '✓ Passed' : '⚠ Issues detected'}
                        </Text>
                    </View>
                    {controlQC.issues && controlQC.issues.length > 0 && (
                        <View style={styles.issuesBox}>
                            {controlQC.issues.map((issue, i) => (
                                <Text key={i} style={styles.issueText}>⚠ {issue}</Text>
                            ))}
                        </View>
                    )}
                </View>
            )}

            {/* Quality metrics */}
            {results.quality && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Image Quality</Text>
                    <View style={styles.qualityRow}>
                        <Text style={styles.qualityLabel}>Sharpness:</Text>
                        <Text style={styles.qualityValue}>
                            {results.quality.sharpness.toFixed(1)}
                        </Text>
                    </View>
                    <View style={styles.qualityRow}>
                        <Text style={styles.qualityLabel}>Brightness:</Text>
                        <Text style={styles.qualityValue}>
                            {results.quality.brightness.toFixed(1)}
                        </Text>
                    </View>
                    <View style={styles.qualityRow}>
                        <Text style={styles.qualityLabel}>Status:</Text>
                        <Text style={[
                            styles.qualityValue,
                            results.quality.is_acceptable ? styles.successText : styles.warningText
                        ]}>
                            {results.quality.is_acceptable ? '✓ Good' : '⚠ Poor'}
                        </Text>
                    </View>
                </View>
            )}

            {/* Well detection info */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Detection Summary</Text>
                <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Wells Detected:</Text>
                    <Text style={styles.summaryValue}>
                        {results.wells_detected} / {results.expected_wells || 96}
                    </Text>
                </View>
                <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>OD Range:</Text>
                    <Text style={styles.summaryValue}>
                        {odRange.min.toFixed(3)} - {odRange.max.toFixed(3)}
                    </Text>
                </View>
            </View>

            {/* Edge effect warning */}
            {edgeEffects && edgeEffects.detected && (
                <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: theme.colors.warning }]}>
                    <Text style={styles.cardTitle}>Edge Effect Warning</Text>
                    <Text style={styles.edgeText}>
                        Outer wells show {(edgeEffects.edge_cv_percent ?? 0).toFixed(1)}% CV vs{' '}
                        {(edgeEffects.inner_cv_percent ?? 0).toFixed(1)}% for inner wells.
                    </Text>
                    <Text style={styles.edgeHint}>
                        Edge wells may be less reliable due to temperature gradients during incubation.
                    </Text>
                </View>
            )}

            {/* Qualitative cutoff */}
            {cutoff != null && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Qualitative Cutoff</Text>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Cutoff (mean+2SD):</Text>
                        <Text style={styles.summaryValue}>{cutoff.toFixed(3)}</Text>
                    </View>
                    {cutoff3 != null && (
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Cutoff (mean+3SD):</Text>
                            <Text style={styles.summaryValue}>{cutoff3.toFixed(3)}</Text>
                        </View>
                    )}
                    <Text style={styles.cutoffHint}>
                        Wells with OD above cutoff are considered positive.
                    </Text>
                </View>
            )}

            {/* Heatmap */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>Well Heatmap</Text>
                <Text style={styles.cardSubtitle}>Color intensity = Optical Density</Text>
                <WellHeatmap wells={wells} />

                {/* Legend */}
                <View style={styles.legend}>
                    <Text style={styles.legendTitle}>OD Scale:</Text>
                    <View style={styles.legendGradient}>
                        {[0, 0.5, 1, 1.5, 2].map((od) => (
                            <View key={od} style={styles.legendItem}>
                                <View
                                    style={[
                                        styles.legendColor,
                                        { backgroundColor: getColorFromOD(od) }
                                    ]}
                                />
                                <Text style={styles.legendText}>{od.toFixed(1)}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
                <TouchableOpacity
                    style={styles.button}
                    onPress={() => navigation.navigate('Calibration', { wells })}
                >
                    <Text style={styles.buttonText}>Calibrate & Quantify</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.button, styles.buttonSecondary]}
                    onPress={handleExportCSV}
                >
                    <Text style={styles.buttonTextSecondary}>Export CSV</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.bottomSpacer} />
        </ScrollView>
    );
}

// --- Styles ------------------------------------------------------------------

const controlStyles = StyleSheet.create({
    modeRow: {
        flexDirection: 'row',
        marginBottom: theme.spacing.md,
    },
    modeBtn: {
        flex: 1,
        paddingVertical: theme.spacing.sm,
        marginHorizontal: theme.spacing.xs,
        borderRadius: theme.borderRadius.md,
        borderWidth: 2,
        borderColor: theme.colors.gray300,
        alignItems: 'center',
    },
    modeBtnNegActive: {
        borderColor: theme.colors.info,
        backgroundColor: '#E3F2FD',
    },
    modeBtnPosActive: {
        borderColor: theme.colors.error,
        backgroundColor: '#FFEBEE',
    },
    modeBtnText: {
        fontSize: theme.typography.body2,
        color: theme.colors.textSecondary,
        fontWeight: '600',
    },
    modeBtnTextActive: {
        color: theme.colors.textPrimary,
    },
    gridContainer: { marginBottom: theme.spacing.md },
    gridRow: { flexDirection: 'row', marginBottom: 2 },
    gridLabel: {
        width: 22,
        height: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    gridLabelText: {
        fontSize: 9,
        color: theme.colors.textSecondary,
        fontWeight: '600',
    },
    cell: {
        width: 22,
        height: 22,
        marginRight: 2,
        borderRadius: 3,
        backgroundColor: theme.colors.gray200,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: theme.colors.gray300,
    },
    cellNeg: {
        backgroundColor: '#BBDEFB',
        borderColor: theme.colors.info,
    },
    cellPos: {
        backgroundColor: '#FFCDD2',
        borderColor: theme.colors.error,
    },
    cellText: {
        fontSize: 12,
        fontWeight: '700',
        color: theme.colors.textPrimary,
    },
    sectionLabel: {
        fontSize: theme.typography.caption,
        fontWeight: '600',
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.xs,
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: theme.spacing.sm,
    },
    chip: {
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        borderRadius: theme.borderRadius.md,
        borderWidth: 1,
        borderColor: theme.colors.gray300,
        marginRight: theme.spacing.xs,
        marginBottom: theme.spacing.xs,
    },
    chipActive: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },
    chipText: {
        fontSize: 11,
        color: theme.colors.textSecondary,
    },
    chipTextActive: {
        color: theme.colors.white,
        fontWeight: '600',
    },
});

const styles = StyleSheet.create({
    scrollView: {
        flex: 1,
        backgroundColor: theme.colors.background,
    },
    container: {
        flex: 1,
        backgroundColor: theme.colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        padding: theme.spacing.lg,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: theme.spacing.md,
        paddingTop: 60,
        backgroundColor: theme.colors.white,
        ...theme.shadows.sm,
    },
    backButton: {
        padding: theme.spacing.sm,
    },
    backText: {
        fontSize: theme.typography.body1,
        color: theme.colors.primary,
        fontWeight: '600',
    },
    headerTitle: {
        fontSize: theme.typography.h5,
        fontWeight: '600',
        color: theme.colors.textPrimary,
    },
    spacer: {
        width: 60,
    },
    imageContainer: {
        padding: theme.spacing.md,
        backgroundColor: theme.colors.white,
    },
    image: {
        width: '100%',
        height: 200,
        borderRadius: theme.borderRadius.lg,
        backgroundColor: theme.colors.gray200,
    },
    loadingText: {
        fontSize: theme.typography.h5,
        color: theme.colors.textPrimary,
        marginTop: theme.spacing.md,
        fontWeight: '600',
    },
    loadingSubtext: {
        fontSize: theme.typography.body2,
        color: theme.colors.textSecondary,
        marginTop: theme.spacing.sm,
        textAlign: 'center',
    },
    errorTitle: {
        fontSize: theme.typography.h4,
        color: theme.colors.error,
        marginBottom: theme.spacing.md,
        fontWeight: '600',
    },
    errorText: {
        fontSize: theme.typography.body1,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        marginBottom: theme.spacing.lg,
    },
    hintText: {
        fontSize: theme.typography.body2,
        color: theme.colors.textSecondary,
        textAlign: 'left',
        marginBottom: theme.spacing.xl,
        padding: theme.spacing.md,
        backgroundColor: theme.colors.gray100,
        borderRadius: theme.borderRadius.md,
    },
    card: {
        backgroundColor: theme.colors.white,
        margin: theme.spacing.md,
        marginTop: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.lg,
        ...theme.shadows.md,
    },
    cardTitle: {
        fontSize: theme.typography.h6,
        fontWeight: '600',
        color: theme.colors.textPrimary,
        marginBottom: theme.spacing.sm,
    },
    cardSubtitle: {
        fontSize: theme.typography.caption,
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.md,
    },
    qualityRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: theme.spacing.xs,
    },
    qualityLabel: {
        fontSize: theme.typography.body2,
        color: theme.colors.textSecondary,
    },
    qualityValue: {
        fontSize: theme.typography.body2,
        color: theme.colors.textPrimary,
        fontWeight: '600',
    },
    successText: {
        color: theme.colors.success,
    },
    warningText: {
        color: theme.colors.warning,
    },
    summaryRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: theme.spacing.xs,
    },
    summaryLabel: {
        fontSize: theme.typography.body1,
        color: theme.colors.textSecondary,
    },
    summaryValue: {
        fontSize: theme.typography.body1,
        color: theme.colors.textPrimary,
        fontWeight: '600',
    },
    issuesBox: {
        marginTop: theme.spacing.sm,
        padding: theme.spacing.sm,
        backgroundColor: theme.colors.accentLight,
        borderRadius: theme.borderRadius.md,
    },
    issueText: {
        fontSize: theme.typography.caption,
        color: theme.colors.gray900,
        marginBottom: 2,
    },
    legend: {
        marginTop: theme.spacing.md,
        paddingTop: theme.spacing.md,
        borderTopWidth: 1,
        borderTopColor: theme.colors.gray200,
    },
    legendTitle: {
        fontSize: theme.typography.caption,
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.sm,
    },
    legendGradient: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    legendItem: {
        alignItems: 'center',
    },
    legendColor: {
        width: 40,
        height: 20,
        borderRadius: theme.borderRadius.sm,
        marginBottom: theme.spacing.xs,
    },
    legendText: {
        fontSize: theme.typography.caption,
        color: theme.colors.textSecondary,
    },
    actions: {
        padding: theme.spacing.md,
    },
    button: {
        backgroundColor: theme.colors.primary,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.borderRadius.lg,
        alignItems: 'center',
        marginBottom: theme.spacing.sm,
        ...theme.shadows.md,
    },
    buttonText: {
        color: theme.colors.white,
        fontSize: theme.typography.button,
        fontWeight: '600',
    },
    buttonSecondary: {
        backgroundColor: theme.colors.white,
        borderWidth: 2,
        borderColor: theme.colors.primary,
    },
    buttonTextSecondary: {
        color: theme.colors.primary,
        fontSize: theme.typography.button,
        fontWeight: '600',
    },
    edgeText: {
        fontSize: theme.typography.body2,
        color: theme.colors.textPrimary,
        marginBottom: theme.spacing.xs,
    },
    edgeHint: {
        fontSize: theme.typography.caption,
        color: theme.colors.textSecondary,
        fontStyle: 'italic',
    },
    cutoffHint: {
        fontSize: theme.typography.caption,
        color: theme.colors.textSecondary,
        marginTop: theme.spacing.xs,
        fontStyle: 'italic',
    },
    bottomSpacer: {
        height: theme.spacing.xl,
    },
});
