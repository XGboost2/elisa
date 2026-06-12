/**
 * Dataset collection screen for validation and future ML training.
 */
import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    Image,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import theme from '../styles/theme';
import {
    saveDatasetPlateOffline,
    listDatasetPlatesOffline,
    attachReaderCsvTextOffline,
    exportDatasetManifestOffline,
} from '../services/localDataset';

const DEFAULT_METADATA = {
    study_name: '',
    assay_name: '',
    operator: '',
    device_model: '',
    lighting_condition: '',
    chromogen: 'tmb',
    assay_type: 'sandwich',
    notes: '',
};

export default function DatasetScreen({ navigation }) {
    const [imageUri, setImageUri] = useState(null);
    const [metadata, setMetadata] = useState(DEFAULT_METADATA);
    const [plates, setPlates] = useState([]);
    const [selectedPlateId, setSelectedPlateId] = useState(null);
    const [csvText, setCsvText] = useState('');
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        refreshPlates();
    }, []);

    const updateMetadata = (key, value) => {
        setMetadata(prev => ({ ...prev, [key]: value }));
    };

    const refreshPlates = async () => {
        setRefreshing(true);
        try {
            const data = await listDatasetPlatesOffline();
            setPlates(data.plates || []);
            if (!selectedPlateId && data.plates?.[0]) {
                setSelectedPlateId(data.plates[0].plate_id);
            }
        } catch (error) {
            Alert.alert('Dataset', error.message);
        } finally {
            setRefreshing(false);
        }
    };

    const pickImage = async (fromCamera) => {
        try {
            const permission = fromCamera
                ? await ImagePicker.requestCameraPermissionsAsync()
                : await ImagePicker.requestMediaLibraryPermissionsAsync();

            if (permission.status !== 'granted') {
                Alert.alert('Permission Required', fromCamera ? 'Camera access is required.' : 'Photo library access is required.');
                return;
            }

            const result = fromCamera
                ? await ImagePicker.launchCameraAsync({ quality: 1, allowsEditing: false })
                : await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    quality: 1,
                    allowsEditing: false,
                });

            if (!result.canceled && result.assets?.[0]) {
                setImageUri(result.assets[0].uri);
            }
        } catch (error) {
            Alert.alert('Image Error', 'Could not select image.');
            console.error('Dataset image error:', error);
        }
    };

    const submitPlate = async () => {
        if (!imageUri) {
            Alert.alert('Dataset', 'Take or select a plate photo first.');
            return;
        }

        setLoading(true);
        try {
            const record = await saveDatasetPlateOffline(imageUri, metadata);
            setSelectedPlateId(record.plate_id);
            setImageUri(null);
            await refreshPlates();
            Alert.alert('Saved', `Dataset plate saved.\nID: ${record.plate_id}`);
        } catch (error) {
            Alert.alert('Upload Failed', error.message);
        } finally {
            setLoading(false);
        }
    };

    const attachCsv = async () => {
        if (!selectedPlateId) {
            Alert.alert('Reader CSV', 'Select a dataset plate first.');
            return;
        }
        if (!csvText.trim()) {
            Alert.alert('Reader CSV', 'Paste plate-reader CSV text first.');
            return;
        }

        setLoading(true);
        try {
            const result = await attachReaderCsvTextOffline(selectedPlateId, csvText);
            setCsvText('');
            await refreshPlates();
            Alert.alert('CSV Attached', `Parsed ${result.parsed_wells} well values.`);
        } catch (error) {
            Alert.alert('CSV Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    const shareManifest = async () => {
        try {
            const csvData = await exportDatasetManifestOffline();
            const fileUri = FileSystem.documentDirectory + 'elisa_dataset_manifest.csv';
            await FileSystem.writeAsStringAsync(fileUri, csvData);
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri, { mimeType: 'text/csv' });
            } else {
                Alert.alert('Manifest Exported', `Saved to ${fileUri}`);
            }
        } catch (error) {
            Alert.alert('Export Error', error.message);
        }
    };

    return (
        <ScrollView style={styles.scrollView}>
            <StatusBar style="dark" />

            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backText}>← Home</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Dataset Collection</Text>
                <View style={styles.spacer} />
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Plate Photo</Text>
                <Text style={styles.cardSubtitle}>
                    Save raw plate photos for validation and future ML labels.
                </Text>
                {imageUri && <Image source={{ uri: imageUri }} style={styles.preview} />}
                <View style={styles.row}>
                    <TouchableOpacity style={styles.secondaryButton} onPress={() => pickImage(true)}>
                        <Text style={styles.secondaryButtonText}>Take Photo</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryButton} onPress={() => pickImage(false)}>
                        <Text style={styles.secondaryButtonText}>Choose Photo</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Metadata</Text>
                {[
                    ['study_name', 'Study / batch name'],
                    ['assay_name', 'Assay name'],
                    ['operator', 'Operator / lab mate ID'],
                    ['device_model', 'Phone / camera model'],
                    ['lighting_condition', 'Lighting / fixture'],
                    ['notes', 'Notes'],
                ].map(([key, label]) => (
                    <View key={key} style={styles.field}>
                        <Text style={styles.label}>{label}</Text>
                        <TextInput
                            style={[styles.input, key === 'notes' && styles.notesInput]}
                            value={metadata[key]}
                            onChangeText={value => updateMetadata(key, value)}
                            placeholder={label}
                            multiline={key === 'notes'}
                        />
                    </View>
                ))}

                <Text style={styles.label}>Chromogen</Text>
                <View style={styles.chipRow}>
                    {['tmb', 'opd', 'pnpp', 'abts', 'grayscale'].map(value => (
                        <TouchableOpacity
                            key={value}
                            style={[styles.chip, metadata.chromogen === value && styles.chipActive]}
                            onPress={() => updateMetadata('chromogen', value)}
                        >
                            <Text style={[styles.chipText, metadata.chromogen === value && styles.chipTextActive]}>
                                {value.toUpperCase()}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <Text style={styles.label}>Assay Type</Text>
                <View style={styles.chipRow}>
                    {['sandwich', 'competitive'].map(value => (
                        <TouchableOpacity
                            key={value}
                            style={[styles.chip, metadata.assay_type === value && styles.chipActive]}
                            onPress={() => updateMetadata('assay_type', value)}
                        >
                            <Text style={[styles.chipText, metadata.assay_type === value && styles.chipTextActive]}>
                                {value}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <TouchableOpacity
                    style={[styles.primaryButton, loading && styles.disabledButton]}
                    onPress={submitPlate}
                    disabled={loading}
                >
                    {loading ? <ActivityIndicator color={theme.colors.white} /> : <Text style={styles.primaryButtonText}>Save Dataset Plate</Text>}
                </TouchableOpacity>
            </View>

            <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                    <Text style={styles.cardTitle}>Collected Plates</Text>
                    <TouchableOpacity onPress={refreshPlates} disabled={refreshing}>
                        <Text style={styles.linkText}>{refreshing ? 'Loading...' : 'Refresh'}</Text>
                    </TouchableOpacity>
                </View>
                {plates.length === 0 ? (
                    <Text style={styles.emptyText}>No dataset plates yet.</Text>
                ) : (
                    plates.slice(0, 12).map(plate => (
                        <TouchableOpacity
                            key={plate.plate_id}
                            style={[
                                styles.plateRow,
                                selectedPlateId === plate.plate_id && styles.plateRowSelected,
                            ]}
                            onPress={() => setSelectedPlateId(plate.plate_id)}
                        >
                            <View style={styles.plateInfo}>
                                <Text style={styles.plateTitle}>
                                    {plate.study_name || 'Untitled study'}
                                </Text>
                                <Text style={styles.plateMeta}>
                                    {plate.plate_id.slice(0, 8)} · {plate.assay_name || 'No assay'} · {plate.reader_wells}/96 reader wells
                                </Text>
                            </View>
                            <Text style={[
                                styles.statusText,
                                plate.has_reader_csv ? styles.successText : styles.warningText,
                            ]}>
                                {plate.has_reader_csv ? 'Labeled' : 'Photo only'}
                            </Text>
                        </TouchableOpacity>
                    ))
                )}
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>Attach Reader CSV</Text>
                <Text style={styles.cardSubtitle}>
                    Paste spectrophotometer CSV for the selected plate. Supported formats: well/OD pairs or 8x12 plate matrix.
                </Text>
                <Text style={styles.selectedId}>
                    Selected: {selectedPlateId ? selectedPlateId : 'none'}
                </Text>
                <TextInput
                    style={styles.csvInput}
                    value={csvText}
                    onChangeText={setCsvText}
                    placeholder={'well,od\nA1,0.052\nA2,0.061'}
                    multiline
                    autoCapitalize="none"
                />
                <TouchableOpacity
                    style={[styles.primaryButton, loading && styles.disabledButton]}
                    onPress={attachCsv}
                    disabled={loading}
                >
                    <Text style={styles.primaryButtonText}>Attach CSV Labels</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.card}>
                <Text style={styles.cardTitle}>ML Export</Text>
                <Text style={styles.cardSubtitle}>
                    Export one row per labeled well with plate ID, image path, metadata, and reader OD.
                </Text>
                <TouchableOpacity style={styles.secondaryButtonFull} onPress={shareManifest}>
                    <Text style={styles.secondaryButtonText}>Export Dataset Manifest CSV</Text>
                </TouchableOpacity>
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
        color: theme.colors.textPrimary,
        fontWeight: '600',
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
    cardHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
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
    preview: {
        width: '100%',
        height: 180,
        backgroundColor: theme.colors.gray200,
        borderRadius: theme.borderRadius.md,
        marginBottom: theme.spacing.md,
    },
    row: {
        flexDirection: 'row',
        gap: theme.spacing.sm,
    },
    field: {
        marginBottom: theme.spacing.sm,
    },
    label: {
        fontSize: theme.typography.caption,
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.xs,
        fontWeight: '600',
    },
    input: {
        borderWidth: 1,
        borderColor: theme.colors.gray300,
        borderRadius: theme.borderRadius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        fontSize: theme.typography.body2,
        color: theme.colors.textPrimary,
        backgroundColor: theme.colors.white,
    },
    notesInput: {
        minHeight: 72,
        textAlignVertical: 'top',
    },
    chipRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginBottom: theme.spacing.md,
    },
    chip: {
        borderWidth: 1,
        borderColor: theme.colors.gray300,
        borderRadius: theme.borderRadius.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        marginRight: theme.spacing.xs,
        marginBottom: theme.spacing.xs,
    },
    chipActive: {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
    },
    chipText: {
        fontSize: theme.typography.caption,
        color: theme.colors.textSecondary,
        fontWeight: '600',
    },
    chipTextActive: {
        color: theme.colors.white,
    },
    primaryButton: {
        backgroundColor: theme.colors.primary,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.borderRadius.lg,
        alignItems: 'center',
        marginTop: theme.spacing.sm,
    },
    primaryButtonText: {
        color: theme.colors.white,
        fontSize: theme.typography.button,
        fontWeight: '600',
    },
    secondaryButton: {
        flex: 1,
        borderWidth: 1,
        borderColor: theme.colors.primary,
        borderRadius: theme.borderRadius.lg,
        paddingVertical: theme.spacing.md,
        alignItems: 'center',
    },
    secondaryButtonFull: {
        borderWidth: 1,
        borderColor: theme.colors.primary,
        borderRadius: theme.borderRadius.lg,
        paddingVertical: theme.spacing.md,
        alignItems: 'center',
    },
    secondaryButtonText: {
        color: theme.colors.primary,
        fontSize: theme.typography.button,
        fontWeight: '600',
    },
    disabledButton: {
        opacity: 0.55,
    },
    linkText: {
        color: theme.colors.primary,
        fontSize: theme.typography.caption,
        fontWeight: '600',
    },
    emptyText: {
        color: theme.colors.textSecondary,
        fontSize: theme.typography.body2,
    },
    plateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: theme.colors.gray300,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.sm,
        marginTop: theme.spacing.sm,
    },
    plateRowSelected: {
        borderColor: theme.colors.primary,
        backgroundColor: theme.colors.primaryLight,
    },
    plateInfo: {
        flex: 1,
        paddingRight: theme.spacing.sm,
    },
    plateTitle: {
        fontSize: theme.typography.body2,
        color: theme.colors.textPrimary,
        fontWeight: '600',
    },
    plateMeta: {
        fontSize: theme.typography.caption,
        color: theme.colors.textSecondary,
        marginTop: 2,
    },
    statusText: {
        fontSize: theme.typography.caption,
        fontWeight: '600',
    },
    successText: { color: theme.colors.success },
    warningText: { color: theme.colors.warning },
    selectedId: {
        fontSize: theme.typography.caption,
        color: theme.colors.textSecondary,
        marginBottom: theme.spacing.sm,
    },
    csvInput: {
        minHeight: 160,
        borderWidth: 1,
        borderColor: theme.colors.gray300,
        borderRadius: theme.borderRadius.md,
        padding: theme.spacing.sm,
        fontSize: theme.typography.caption,
        color: theme.colors.textPrimary,
        textAlignVertical: 'top',
        backgroundColor: theme.colors.gray100,
    },
    bottomSpacer: {
        height: theme.spacing.xxl,
    },
});
