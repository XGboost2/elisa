/**
 * Results screen - displays analysis results with heatmap
 */
import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import theme from '../styles/theme';
import { analyzeImage } from '../services/apiClient';
import WellHeatmap, { getColorFromOD } from '../components/WellHeatmap';

export default function ResultsScreen({ route, navigation }) {
    const { imageUri } = route.params;
    const [loading, setLoading] = useState(true);
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        analyzeResult();
    }, []);

    const analyzeResult = async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await analyzeImage(imageUri);
            if (mountedRef.current) setResults(data);
        } catch (err) {
            console.error('ResultsScreen error:', err);
            const errorMessage =
                typeof err === 'string' ? err :
                err instanceof Error ? err.message :
                err?.message ?? String(err);
            if (mountedRef.current) setError(errorMessage);
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    };

    if (loading) {
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

    if (error) {
        return (
            <View style={styles.container}>
                <StatusBar style="dark" />
                <Text style={styles.errorTitle}>❌ Analysis Failed</Text>
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity
                    style={styles.button}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.buttonText}>Go Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.button, styles.buttonSecondary]}
                    onPress={analyzeResult}
                >
                    <Text style={styles.buttonTextSecondary}>Retry</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (!results || !results.success) {
        return (
            <View style={styles.container}>
                <StatusBar style="dark" />
                <Text style={styles.errorTitle}>⚠️ No Plate Detected</Text>
                <Text style={styles.errorText}>
                    {results?.error || 'Could not detect ELISA plate in the image.'}
                </Text>
                <Text style={styles.hintText}>
                    Please ensure:
                    {'\n'}• The plate is clearly visible
                    {'\n'}• Good lighting without shadows
                    {'\n'}• Camera is positioned directly above
                </Text>
                <TouchableOpacity
                    style={styles.button}
                    onPress={() => navigation.goBack()}
                >
                    <Text style={styles.buttonText}>Try Again</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const wells = results.wells || [];
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

            <View style={styles.bottomSpacer} />
        </ScrollView>
    );
}

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
        marginTop: 0,
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
    bottomSpacer: {
        height: theme.spacing.xl,
    },
});
