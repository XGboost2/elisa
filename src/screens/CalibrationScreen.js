/**
 * Calibration screen — lets users select standard wells, enter known
 * concentrations, fit a calibration curve, and calculate unknown concentrations.
 */
import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import theme from '../styles/theme';
import { createCalibrationOffline, quantifySamplesOffline } from '../services/localCalibration';

const ROW_LABELS = 'ABCDEFGH';

export default function CalibrationScreen({ route, navigation }) {
    const { wells = [] } = route.params;

    const [selectedStandards, setSelectedStandards] = useState({});
    const [curveType, setCurveType] = useState('auto');
    const [calibrationResult, setCalibrationResult] = useState(null);
    const [quantifiedResults, setQuantifiedResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const [dilutionStart, setDilutionStart] = useState('');
    const [dilutionFactor, setDilutionFactor] = useState('2');

    const grid = useMemo(() => {
        const g = Array(8).fill(null).map(() => Array(12).fill(null));
        wells.forEach(w => {
            if (w.row < 8 && w.col < 12) g[w.row][w.col] = w;
        });
        return g;
    }, [wells]);

    const toggleStandard = (position) => {
        setSelectedStandards(prev => {
            const copy = { ...prev };
            if (copy[position] !== undefined) {
                delete copy[position];
            } else {
                copy[position] = '';
            }
            return copy;
        });
    };

    const updateConcentration = (position, value) => {
        setSelectedStandards(prev => ({ ...prev, [position]: value }));
    };

    const standardPositions = Object.keys(selectedStandards);

    const canFit = useMemo(() => {
        if (standardPositions.length < 3) return false;
        return standardPositions.every(pos => {
            const val = parseFloat(selectedStandards[pos]);
            return !isNaN(val) && val >= 0;
        });
    }, [selectedStandards]);

    const handleFitCurve = async () => {
        if (!canFit) return;

        setLoading(true);
        try {
            const concentrations = [];
            const odValues = [];

            standardPositions.forEach(pos => {
                const well = wells.find(w => w.position === pos);
                if (well) {
                    concentrations.push(parseFloat(selectedStandards[pos]));
                    odValues.push(well.optical_density);
                }
            });

            const result = await createCalibrationOffline(concentrations, odValues, curveType);
            setCalibrationResult(result);

            const unknownODs = wells
                .filter(w => !selectedStandards.hasOwnProperty(w.position))
                .map(w => w.optical_density);

            if (unknownODs.length > 0 && result.calibration_id) {
                const qResult = await quantifySamplesOffline(result, unknownODs);
                const unknownWells = wells.filter(w => !selectedStandards.hasOwnProperty(w.position));
                const mapped = qResult.results.map((r, i) => ({
                    ...r,
                    position: unknownWells[i]?.position,
                }));
                setQuantifiedResults(mapped);
            }
        } catch (err) {
            Alert.alert('Calibration Error', err.message);
        } finally {
            setLoading(false);
        }
    };

    const curveTypes = ['auto', 'linear', 'polynomial', '4pl'];

    return (
        <ScrollView style={styles.scrollView}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>← Results</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Calibration</Text>
                <View style={styles.spacer} />
            </View>

            {/* Instructions */}
            <View style={styles.card}>
                <Text style={styles.cardTitle}>1. Select Standard Wells</Text>
                <Text style={styles.cardSubtitle}>
                    Tap wells that contain known concentrations
                </Text>

                {/* Mini grid for selection */}
                <View style={styles.gridContainer}>
                    <View style={styles.gridRow}>
                        <View style={styles.gridLabel} />
                        {Array.from({ length: 12 }).map((_, i) => (
                            <View key={i} style={styles.gridLabel}>
                                <Text style={styles.gridLabelText}>{i + 1}</Text>
                            </View>
                        ))}
                    </View>
                    {grid.map((row, ri) => (
                        <View key={ri} style={styles.gridRow}>
                            <View style={styles.gridLabel}>
                                <Text style={styles.gridLabelText}>{ROW_LABELS[ri]}</Text>
                            </View>
                            {row.map((well, ci) => {
                                const pos = `${ROW_LABELS[ri]}${ci + 1}`;
                                const isSelected = selectedStandards.hasOwnProperty(pos);
                                return (
                                    <TouchableOpacity
                                        key={ci}
                                        style={[
                                            styles.gridCell,
                                            well && styles.gridCellActive,
                                            isSelected && styles.gridCellSelected,
                                        ]}
                                        onPress={() => well && toggleStandard(pos)}
                                        disabled={!well}
                                    >
                                        <Text style={styles.gridCellText}>
                                            {isSelected ? '★' : ''}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    ))}
                </View>
            </View>

            {/* Serial dilution helper */}
            {standardPositions.length >= 2 && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Serial Dilution Helper</Text>
                    <Text style={styles.cardSubtitle}>
                        Auto-fill concentrations from a dilution series
                    </Text>
                    <View style={styles.dilutionRow}>
                        <View style={styles.dilutionField}>
                            <Text style={styles.dilutionLabel}>Start conc.</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="1000"
                                keyboardType="decimal-pad"
                                value={dilutionStart}
                                onChangeText={setDilutionStart}
                            />
                        </View>
                        <View style={styles.dilutionField}>
                            <Text style={styles.dilutionLabel}>Dilution factor</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="2"
                                keyboardType="decimal-pad"
                                value={dilutionFactor}
                                onChangeText={setDilutionFactor}
                            />
                        </View>
                        <TouchableOpacity
                            style={[styles.dilutionBtn, (!dilutionStart || !dilutionFactor) && { opacity: 0.4 }]}
                            disabled={!dilutionStart || !dilutionFactor}
                            onPress={() => {
                                const start = parseFloat(dilutionStart);
                                const factor = parseFloat(dilutionFactor);
                                if (isNaN(start) || isNaN(factor) || factor <= 0) return;
                                const sorted = [...standardPositions].sort();
                                const updated = { ...selectedStandards };
                                sorted.forEach((pos, i) => {
                                    updated[pos] = String(start / (factor ** i));
                                });
                                setSelectedStandards(updated);
                            }}
                        >
                            <Text style={styles.dilutionBtnText}>Fill</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Concentration inputs */}
            {standardPositions.length > 0 && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>2. Enter Concentrations</Text>
                    <Text style={styles.cardSubtitle}>
                        Enter known concentration for each standard well
                    </Text>

                    {standardPositions.sort().map(pos => {
                        const well = wells.find(w => w.position === pos);
                        return (
                            <View key={pos} style={styles.inputRow}>
                                <Text style={styles.inputLabel}>
                                    {pos} (OD: {well?.optical_density?.toFixed(3) ?? '—'})
                                </Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="0.00"
                                    keyboardType="decimal-pad"
                                    value={selectedStandards[pos]}
                                    onChangeText={val => updateConcentration(pos, val)}
                                />
                            </View>
                        );
                    })}
                </View>
            )}

            {/* Curve type selector */}
            {standardPositions.length >= 3 && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>3. Curve Type</Text>
                    <View style={styles.curveTypeRow}>
                        {curveTypes.map(ct => (
                            <TouchableOpacity
                                key={ct}
                                style={[
                                    styles.curveTypeButton,
                                    curveType === ct && styles.curveTypeButtonActive,
                                ]}
                                onPress={() => setCurveType(ct)}
                            >
                                <Text style={[
                                    styles.curveTypeText,
                                    curveType === ct && styles.curveTypeTextActive,
                                ]}>
                                    {ct.toUpperCase()}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TouchableOpacity
                        style={[styles.fitButton, !canFit && styles.fitButtonDisabled]}
                        onPress={handleFitCurve}
                        disabled={!canFit || loading}
                    >
                        {loading ? (
                            <ActivityIndicator size="small" color={theme.colors.white} />
                        ) : (
                            <Text style={styles.fitButtonText}>Fit Curve & Calculate</Text>
                        )}
                    </TouchableOpacity>
                </View>
            )}

            {/* Calibration results */}
            {calibrationResult && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Calibration Results</Text>
                    <View style={styles.resultRow}>
                        <Text style={styles.resultLabel}>Curve Type:</Text>
                        <Text style={styles.resultValue}>{calibrationResult.curve_type}</Text>
                    </View>
                    <View style={styles.resultRow}>
                        <Text style={styles.resultLabel}>R²:</Text>
                        <Text style={[
                            styles.resultValue,
                            calibrationResult.r_squared >= 0.95
                                ? styles.successText
                                : styles.warningText,
                        ]}>
                            {calibrationResult.r_squared?.toFixed(4)}
                        </Text>
                    </View>
                    <View style={styles.resultRow}>
                        <Text style={styles.resultLabel}>Equation:</Text>
                        <Text style={[styles.resultValue, { fontSize: 11 }]} numberOfLines={2}>
                            {calibrationResult.equation}
                        </Text>
                    </View>
                    {calibrationResult.validation?.hook_effect?.detected && (
                        <View style={[styles.issuesBox, { borderLeftWidth: 3, borderLeftColor: theme.colors.error }]}>
                            <Text style={[styles.issueText, { fontWeight: '600' }]}>
                                Hook Effect Detected
                            </Text>
                            <Text style={styles.issueText}>
                                {calibrationResult.validation.hook_effect.message}
                            </Text>
                        </View>
                    )}
                    {calibrationResult.validation?.issues && (
                        <View style={styles.issuesBox}>
                            {calibrationResult.validation.issues.map((issue, i) => (
                                <Text key={i} style={styles.issueText}>⚠ {issue}</Text>
                            ))}
                        </View>
                    )}
                </View>
            )}

            {/* Quantified concentrations */}
            {quantifiedResults && quantifiedResults.length > 0 && (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Calculated Concentrations</Text>
                    <Text style={styles.cardSubtitle}>Unknown sample wells</Text>

                    <View style={styles.tableHeader}>
                        <Text style={[styles.tableCell, styles.tableHeaderText]}>Well</Text>
                        <Text style={[styles.tableCell, styles.tableHeaderText]}>OD</Text>
                        <Text style={[styles.tableCell, styles.tableHeaderText]}>Conc.</Text>
                        <Text style={[styles.tableCell, styles.tableHeaderText]}>Status</Text>
                    </View>

                    {quantifiedResults.map((r, i) => (
                        <View key={i} style={styles.tableRow}>
                            <Text style={styles.tableCell}>{r.position ?? '—'}</Text>
                            <Text style={styles.tableCell}>{r.od_value?.toFixed(3)}</Text>
                            <Text style={styles.tableCell}>
                                {r.concentration != null ? r.concentration.toFixed(3) : '—'}
                            </Text>
                            <Text style={[
                                styles.tableCell,
                                r.status === 'calculated' ? styles.successText : styles.warningText,
                            ]}>
                                {r.status === 'calculated' ? '✓' : 'OOR'}
                            </Text>
                        </View>
                    ))}
                </View>
            )}

            <View style={styles.bottomSpacer} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollView: {
        flex: 1,
        backgroundColor: theme.colors.background,
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
    backButton: { padding: theme.spacing.sm },
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
    spacer: { width: 60 },
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
        marginBottom: theme.spacing.xs,
    },
    cardSubtitle: {
        fontSize: theme.typography.caption,
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.md,
    },
    gridContainer: { marginTop: theme.spacing.xs },
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
    gridCell: {
        width: 22,
        height: 22,
        marginRight: 2,
        borderRadius: 3,
        backgroundColor: theme.colors.gray200,
        justifyContent: 'center',
        alignItems: 'center',
    },
    gridCellActive: { backgroundColor: theme.colors.gray300 },
    gridCellSelected: { backgroundColor: theme.colors.primary },
    gridCellText: { fontSize: 10, color: theme.colors.white, fontWeight: '700' },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: theme.spacing.sm,
    },
    inputLabel: {
        flex: 1,
        fontSize: theme.typography.body2,
        color: theme.colors.textPrimary,
    },
    input: {
        width: 100,
        borderWidth: 1,
        borderColor: theme.colors.gray300,
        borderRadius: theme.borderRadius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        fontSize: theme.typography.body2,
        textAlign: 'right',
    },
    curveTypeRow: {
        flexDirection: 'row',
        marginBottom: theme.spacing.md,
    },
    curveTypeButton: {
        flex: 1,
        paddingVertical: theme.spacing.sm,
        marginRight: theme.spacing.xs,
        borderRadius: theme.borderRadius.md,
        borderWidth: 1,
        borderColor: theme.colors.gray300,
        alignItems: 'center',
    },
    curveTypeButtonActive: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },
    curveTypeText: {
        fontSize: theme.typography.caption,
        color: theme.colors.textSecondary,
        fontWeight: '600',
    },
    curveTypeTextActive: { color: theme.colors.white },
    fitButton: {
        backgroundColor: theme.colors.primary,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.borderRadius.lg,
        alignItems: 'center',
        ...theme.shadows.md,
    },
    fitButtonDisabled: { opacity: 0.5 },
    fitButtonText: {
        color: theme.colors.white,
        fontSize: theme.typography.button,
        fontWeight: '600',
    },
    resultRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: theme.spacing.xs,
    },
    resultLabel: {
        fontSize: theme.typography.body2,
        color: theme.colors.textSecondary,
    },
    resultValue: {
        fontSize: theme.typography.body2,
        color: theme.colors.textPrimary,
        fontWeight: '600',
        flexShrink: 1,
        textAlign: 'right',
    },
    successText: { color: theme.colors.success },
    warningText: { color: theme.colors.warning },
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
    tableHeader: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.gray300,
        paddingBottom: theme.spacing.xs,
        marginBottom: theme.spacing.xs,
    },
    tableHeaderText: { fontWeight: '600', color: theme.colors.textPrimary },
    tableRow: {
        flexDirection: 'row',
        paddingVertical: 3,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: theme.colors.gray200,
    },
    tableCell: {
        flex: 1,
        fontSize: theme.typography.caption,
        color: theme.colors.textSecondary,
    },
    dilutionRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    dilutionField: {
        flex: 1,
        marginRight: theme.spacing.sm,
    },
    dilutionLabel: {
        fontSize: theme.typography.caption,
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.xs,
    },
    dilutionBtn: {
        backgroundColor: theme.colors.secondary,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.borderRadius.md,
        marginBottom: 1,
    },
    dilutionBtnText: {
        color: theme.colors.white,
        fontWeight: '600',
        fontSize: theme.typography.body2,
    },
    bottomSpacer: { height: theme.spacing.xxl },
});
