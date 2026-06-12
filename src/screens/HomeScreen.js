/**
 * Home screen - main dashboard
 */
import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Alert,
    useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import theme from '../styles/theme';

const PLATE_ROWS = 'ABCDEFGH'.split('');
const PLATE_COLS = Array.from({ length: 12 }, (_, index) => index + 1);

const workflows = [
    {
        title: 'Offline OD Scan',
        metric: '96 wells',
        detail: 'Uniform plate sampling with chromogen-specific color scoring.',
    },
    {
        title: 'Calibration',
        metric: 'linear / poly',
        detail: 'Create standard curves and quantify unknown sample wells.',
    },
    {
        title: 'ML Dataset',
        metric: 'reader CSV',
        detail: 'Collect raw photos and attach plate-reader labels later.',
    },
];

const qualityItems = [
    'TMB, OPD, pNPP, ABTS, and grayscale modes',
    'Control normalization and edge-effect checks',
    'CSV exports for analysis and documentation',
];

function WellPreview() {
    return (
        <View style={styles.previewPlate}>
            {PLATE_ROWS.map((row, rowIndex) => (
                <View key={row} style={styles.previewRow}>
                    {PLATE_COLS.map(col => {
                        const signal = (rowIndex * 13 + col * 7) % 100;
                        return (
                            <View
                                key={`${row}${col}`}
                                style={[
                                    styles.previewWell,
                                    {
                                        opacity: 0.35 + signal / 160,
                                        backgroundColor: signal > 65
                                            ? '#2f80ed'
                                            : signal > 35
                                                ? '#62c6c8'
                                                : '#d7eef5',
                                    },
                                ]}
                            />
                        );
                    })}
                </View>
            ))}
        </View>
    );
}

export default function HomeScreen({ navigation }) {
    const { width } = useWindowDimensions();
    const isWide = width >= 760;

    const handleCapturePress = () => {
        navigation.navigate('Camera');
    };

    const handleUploadPress = async () => {
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (status !== 'granted') {
                Alert.alert('Permission Required', 'Please grant photo library access to select images.');
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: false,
                quality: 1,
            });

            if (!result.canceled && result.assets[0]) {
                navigation.navigate('Results', { imageUri: result.assets[0].uri });
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to pick image.');
            console.error('Image picker error:', error);
        }
    };

    return (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
            <StatusBar style="dark" />

            <View style={styles.topBar}>
                <View>
                    <Text style={styles.brand}>ELISA Analyzer</Text>
                    <Text style={styles.brandSub}>Camera-based plate analysis</Text>
                </View>

                <View style={styles.statusPill}>
                    <View style={styles.statusDot} />
                    <Text style={styles.statusText}>Offline Ready</Text>
                </View>
            </View>

            <View style={[styles.hero, isWide && styles.heroWide]}>
                <View style={[styles.heroCopy, isWide && styles.heroCopyWide]}>
                    <Text style={styles.kicker}>Research Use Only</Text>
                    <Text style={styles.title}>Read ELISA plates from a phone photo.</Text>
                    <Text style={styles.subtitle}>
                        Capture, analyze, calibrate, and export 96-well plate data without a backend connection.
                    </Text>

                    <View style={[styles.actionRow, !isWide && styles.actionRowStacked]}>
                        <TouchableOpacity style={styles.primaryAction} onPress={handleCapturePress}>
                            <Text style={styles.primaryActionIcon}>◉</Text>
                            <View style={styles.actionTextBlock}>
                                <Text style={styles.primaryActionText}>Capture Plate</Text>
                                <Text style={styles.primaryActionSubtext}>Open camera</Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.secondaryAction} onPress={handleUploadPress}>
                            <Text style={styles.secondaryActionIcon}>↑</Text>
                            <View style={styles.actionTextBlock}>
                                <Text style={styles.secondaryActionText}>Upload Photo</Text>
                                <Text style={styles.secondaryActionSubtext}>Choose image</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={[styles.previewPanel, isWide && styles.previewPanelWide]}>
                    <View style={styles.previewHeader}>
                        <Text style={styles.previewTitle}>TMB Plate Preview</Text>
                        <Text style={styles.previewBadge}>96 wells</Text>
                    </View>
                    <WellPreview />
                    <View style={styles.previewStatsRow}>
                        <View style={styles.previewStat}>
                            <Text style={styles.previewStatValue}>0.84</Text>
                            <Text style={styles.previewStatLabel}>mean OD</Text>
                        </View>
                        <View style={styles.previewStat}>
                            <Text style={styles.previewStatValue}>7.2%</Text>
                            <Text style={styles.previewStatLabel}>edge delta</Text>
                        </View>
                        <View style={styles.previewStat}>
                            <Text style={styles.previewStatValue}>pass</Text>
                            <Text style={styles.previewStatLabel}>QC</Text>
                        </View>
                    </View>
                </View>
            </View>

            <View style={[styles.workflowGrid, isWide && styles.workflowGridWide]}>
                {workflows.map(item => (
                    <View key={item.title} style={[styles.workflowCard, isWide && styles.workflowCardWide]}>
                        <Text style={styles.workflowMetric}>{item.metric}</Text>
                        <Text style={styles.workflowTitle}>{item.title}</Text>
                        <Text style={styles.workflowDetail}>{item.detail}</Text>
                    </View>
                ))}
            </View>

            <View style={[styles.datasetBand, isWide && styles.datasetBandWide]}>
                <View style={styles.datasetCopy}>
                    <Text style={styles.datasetTitle}>Build a labeled validation set</Text>
                    <Text style={styles.datasetText}>
                        Save plate photos with assay metadata, then attach spectrophotometer CSV labels when they are ready.
                    </Text>
                </View>
                <TouchableOpacity
                    style={styles.datasetAction}
                    onPress={() => navigation.navigate('Dataset')}
                >
                    <Text style={styles.datasetActionText}>Collect ML Dataset</Text>
                </TouchableOpacity>
            </View>

            <View style={[styles.detailsGrid, isWide && styles.detailsGridWide]}>
                <View style={[styles.detailPanel, isWide && styles.detailPanelWide]}>
                    <Text style={styles.detailTitle}>Analysis Checks</Text>
                    {qualityItems.map(item => (
                        <View key={item} style={styles.checkRow}>
                            <View style={styles.checkMark} />
                            <Text style={styles.checkText}>{item}</Text>
                        </View>
                    ))}
                </View>

                <View style={[styles.detailPanel, styles.noticePanel, isWide && styles.detailPanelWide]}>
                    <Text style={styles.noticeTitle}>Research workflow</Text>
                    <Text style={styles.noticeText}>
                        Camera-derived values are useful for screening and validation workflows. Confirm critical measurements with a calibrated plate reader.
                    </Text>
                </View>
            </View>

            <View style={styles.bottomSpacer} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scrollView: {
        flex: 1,
        backgroundColor: '#f6f8fb',
    },
    content: {
        paddingBottom: theme.spacing.xxl,
    },
    topBar: {
        paddingHorizontal: theme.spacing.lg,
        paddingTop: 58,
        paddingBottom: theme.spacing.md,
        backgroundColor: '#f6f8fb',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    brand: {
        fontSize: theme.typography.h5,
        fontWeight: '700',
        color: '#132238',
    },
    brandSub: {
        fontSize: theme.typography.caption,
        color: '#65758b',
        marginTop: 2,
    },
    statusPill: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#d7e2ec',
        borderRadius: theme.borderRadius.round,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 6,
        backgroundColor: theme.colors.white,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#2eb67d',
        marginRight: 6,
    },
    statusText: {
        fontSize: theme.typography.caption,
        color: '#334155',
        fontWeight: '600',
    },
    hero: {
        marginHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.lg,
    },
    heroWide: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.lg,
    },
    heroCopy: {
        marginBottom: theme.spacing.lg,
    },
    heroCopyWide: {
        flex: 1.05,
        marginBottom: 0,
    },
    kicker: {
        alignSelf: 'flex-start',
        color: '#0f766e',
        backgroundColor: '#dff7f2',
        borderRadius: theme.borderRadius.round,
        overflow: 'hidden',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 5,
        fontSize: theme.typography.caption,
        fontWeight: '700',
        marginBottom: theme.spacing.md,
    },
    title: {
        fontSize: 38,
        lineHeight: 44,
        color: '#101828',
        fontWeight: '800',
        maxWidth: 620,
    },
    subtitle: {
        fontSize: theme.typography.body1,
        lineHeight: 24,
        color: '#536579',
        marginTop: theme.spacing.md,
        maxWidth: 560,
    },
    actionRow: {
        flexDirection: 'row',
        gap: theme.spacing.md,
        marginTop: theme.spacing.lg,
    },
    actionRowStacked: {
        flexDirection: 'column',
    },
    primaryAction: {
        minHeight: 72,
        flex: 1,
        backgroundColor: '#1769e0',
        borderRadius: theme.borderRadius.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        ...theme.shadows.md,
    },
    secondaryAction: {
        minHeight: 72,
        flex: 1,
        backgroundColor: theme.colors.white,
        borderWidth: 1,
        borderColor: '#d7e2ec',
        borderRadius: theme.borderRadius.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
    },
    primaryActionIcon: {
        width: 34,
        height: 34,
        borderRadius: 17,
        overflow: 'hidden',
        textAlign: 'center',
        lineHeight: 34,
        backgroundColor: 'rgba(255,255,255,0.18)',
        color: theme.colors.white,
        fontSize: 19,
        marginRight: theme.spacing.sm,
    },
    secondaryActionIcon: {
        width: 34,
        height: 34,
        borderRadius: 17,
        overflow: 'hidden',
        textAlign: 'center',
        lineHeight: 32,
        borderWidth: 1,
        borderColor: '#c8d5e3',
        color: '#1769e0',
        fontSize: 22,
        marginRight: theme.spacing.sm,
    },
    actionTextBlock: {
        flex: 1,
    },
    primaryActionText: {
        color: theme.colors.white,
        fontSize: theme.typography.body1,
        fontWeight: '700',
    },
    primaryActionSubtext: {
        color: '#dbeafe',
        fontSize: theme.typography.caption,
        marginTop: 2,
    },
    secondaryActionText: {
        color: '#132238',
        fontSize: theme.typography.body1,
        fontWeight: '700',
    },
    secondaryActionSubtext: {
        color: '#65758b',
        fontSize: theme.typography.caption,
        marginTop: 2,
    },
    previewPanel: {
        backgroundColor: theme.colors.white,
        borderRadius: theme.borderRadius.md,
        borderWidth: 1,
        borderColor: '#dce6ef',
        padding: theme.spacing.md,
        ...theme.shadows.md,
    },
    previewPanelWide: {
        flex: 0.95,
    },
    previewHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: theme.spacing.md,
    },
    previewTitle: {
        color: '#132238',
        fontSize: theme.typography.body1,
        fontWeight: '700',
    },
    previewBadge: {
        color: '#1769e0',
        fontSize: theme.typography.caption,
        fontWeight: '700',
        backgroundColor: '#eaf2ff',
        borderRadius: theme.borderRadius.round,
        overflow: 'hidden',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 4,
    },
    previewPlate: {
        aspectRatio: 1.48,
        borderRadius: theme.borderRadius.md,
        borderWidth: 1,
        borderColor: '#cad7e4',
        backgroundColor: '#f8fbfd',
        padding: theme.spacing.sm,
        justifyContent: 'space-between',
    },
    previewRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    previewWell: {
        width: '6.7%',
        aspectRatio: 1,
        borderRadius: theme.borderRadius.round,
        borderWidth: 1,
        borderColor: 'rgba(19,34,56,0.08)',
    },
    previewStatsRow: {
        flexDirection: 'row',
        gap: theme.spacing.sm,
        marginTop: theme.spacing.md,
    },
    previewStat: {
        flex: 1,
        borderRadius: theme.borderRadius.md,
        backgroundColor: '#f6f8fb',
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
    },
    previewStatValue: {
        color: '#132238',
        fontSize: theme.typography.h6,
        fontWeight: '800',
    },
    previewStatLabel: {
        color: '#65758b',
        fontSize: theme.typography.caption,
        marginTop: 2,
    },
    workflowGrid: {
        paddingHorizontal: theme.spacing.lg,
        gap: theme.spacing.md,
    },
    workflowGridWide: {
        flexDirection: 'row',
    },
    workflowCard: {
        backgroundColor: theme.colors.white,
        borderWidth: 1,
        borderColor: '#dce6ef',
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.md,
    },
    workflowCardWide: {
        flex: 1,
    },
    workflowMetric: {
        color: '#0f766e',
        fontSize: theme.typography.caption,
        fontWeight: '800',
        marginBottom: theme.spacing.sm,
        textTransform: 'uppercase',
    },
    workflowTitle: {
        color: '#132238',
        fontSize: theme.typography.h6,
        fontWeight: '800',
    },
    workflowDetail: {
        color: '#65758b',
        fontSize: theme.typography.body2,
        lineHeight: 20,
        marginTop: theme.spacing.xs,
    },
    datasetBand: {
        margin: theme.spacing.lg,
        borderRadius: theme.borderRadius.md,
        backgroundColor: '#132238',
        padding: theme.spacing.lg,
    },
    datasetBandWide: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    datasetCopy: {
        flex: 1,
        paddingRight: theme.spacing.md,
    },
    datasetTitle: {
        color: theme.colors.white,
        fontSize: theme.typography.h5,
        fontWeight: '800',
    },
    datasetText: {
        color: '#c7d7e8',
        fontSize: theme.typography.body2,
        lineHeight: 21,
        marginTop: theme.spacing.xs,
    },
    datasetAction: {
        marginTop: theme.spacing.md,
        backgroundColor: '#54d6c2',
        borderRadius: theme.borderRadius.md,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        alignItems: 'center',
    },
    datasetActionText: {
        color: '#062522',
        fontSize: theme.typography.button,
        fontWeight: '800',
    },
    detailsGrid: {
        paddingHorizontal: theme.spacing.lg,
        gap: theme.spacing.md,
    },
    detailsGridWide: {
        flexDirection: 'row',
    },
    detailPanel: {
        backgroundColor: theme.colors.white,
        borderRadius: theme.borderRadius.md,
        borderWidth: 1,
        borderColor: '#dce6ef',
        padding: theme.spacing.md,
    },
    detailPanelWide: {
        flex: 1,
    },
    detailTitle: {
        color: '#132238',
        fontSize: theme.typography.h6,
        fontWeight: '800',
        marginBottom: theme.spacing.sm,
    },
    checkRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginTop: theme.spacing.sm,
    },
    checkMark: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#2eb67d',
        marginTop: 6,
        marginRight: theme.spacing.sm,
    },
    checkText: {
        flex: 1,
        color: '#536579',
        fontSize: theme.typography.body2,
        lineHeight: 20,
    },
    noticePanel: {
        backgroundColor: '#fff8ed',
        borderColor: '#f3d6a4',
    },
    noticeTitle: {
        color: '#7a4b00',
        fontSize: theme.typography.h6,
        fontWeight: '800',
        marginBottom: theme.spacing.xs,
    },
    noticeText: {
        color: '#755321',
        fontSize: theme.typography.body2,
        lineHeight: 21,
    },
    bottomSpacer: {
        height: theme.spacing.xl,
    },
});
