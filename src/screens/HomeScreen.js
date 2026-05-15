/**
 * Home screen - main dashboard
 */
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import theme from '../styles/theme';
import { testConnection } from '../services/apiClient';

export default function HomeScreen({ navigation }) {
    const [backendStatus, setBackendStatus] = useState('checking');

    useEffect(() => {
        checkBackend();
    }, []);

    const checkBackend = async () => {
        const isConnected = await testConnection();
        setBackendStatus(isConnected ? 'connected' : 'disconnected');
    };

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
        <ScrollView style={styles.scrollView}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>ELISA Analyzer</Text>
                    <Text style={styles.subtitle}>Camera-based plate analysis</Text>
                </View>

                {/* Backend status indicator */}
                <View style={styles.statusContainer}>
                    <View style={[
                        styles.statusDot,
                        {
                            backgroundColor: backendStatus === 'connected'
                                ? theme.colors.success
                                : theme.colors.error
                        }
                    ]} />
                    <Text style={styles.statusText}>
                        {backendStatus === 'checking' ? 'Checking...' :
                            backendStatus === 'connected' ? 'Connected' : 'Offline'}
                    </Text>
                </View>
            </View>

            {/* Backend warning */}
            {backendStatus !== 'connected' && (
                <View style={styles.warningBanner}>
                    <Text style={styles.warningText}>
                        ⚠️ Backend server not connected. Please start the Python backend.
                    </Text>
                    <TouchableOpacity onPress={checkBackend}>
                        <Text style={styles.retryText}>Retry</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Main action */}
            <View style={styles.mainAction}>
                <TouchableOpacity
                    style={styles.captureButton}
                    onPress={handleCapturePress}
                >
                    <Text style={styles.captureIcon}>📸</Text>
                    <Text style={styles.captureText}>Capture Plate</Text>
                    <Text style={styles.captureSubtext}>
                        Take a photo with camera
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.uploadButton}
                    onPress={handleUploadPress}
                >
                    <Text style={styles.uploadIcon}>📁</Text>
                    <Text style={styles.uploadText}>Upload Photo</Text>
                    <Text style={styles.uploadSubtext}>
                        Analyze existing images
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Features grid */}
            <View style={styles.featuresContainer}>
                <Text style={styles.sectionTitle}>Features</Text>

                <View style={styles.featuresGrid}>
                    <View style={styles.featureCard}>
                        <Text style={styles.featureIcon}>🔬</Text>
                        <Text style={styles.featureTitle}>Automated Detection</Text>
                        <Text style={styles.featureDescription}>
                            Detects 96-well grid automatically
                        </Text>
                    </View>

                    <View style={styles.featureCard}>
                        <Text style={styles.featureIcon}>📊</Text>
                        <Text style={styles.featureTitle}>OD Calculation</Text>
                        <Text style={styles.featureDescription}>
                            Calculates optical density for each well
                        </Text>
                    </View>

                    <View style={styles.featureCard}>
                        <Text style={styles.featureIcon}>📈</Text>
                        <Text style={styles.featureTitle}>Calibration</Text>
                        <Text style={styles.featureDescription}>
                            Multiple curve fitting options
                        </Text>
                    </View>

                    <View style={styles.featureCard}>
                        <Text style={styles.featureIcon}>💾</Text>
                        <Text style={styles.featureTitle}>Export Data</Text>
                        <Text style={styles.featureDescription}>
                            Export results to CSV/PDF
                        </Text>
                    </View>
                </View>
            </View>

            {/* Quick info */}
            <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>How it works</Text>
                <Text style={styles.infoText}>
                    1. 📸 Capture a clear photo of your ELISA plate{'\n'}
                    2. 🔍 AI detects the wells and analyzes colors{'\n'}
                    3. 📊 View optical density heatmap{'\n'}
                    4. 📈 Create calibration curves (optional){'\n'}
                    5. 💾 Export results for your records
                </Text>
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
        padding: theme.spacing.lg,
        paddingTop: 60,
        backgroundColor: theme.colors.white,
        ...theme.shadows.sm,
    },
    title: {
        fontSize: theme.typography.h3,
        fontWeight: '700',
        color: theme.colors.primary,
    },
    subtitle: {
        fontSize: theme.typography.body1,
        color: theme.colors.textSecondary,
        marginTop: theme.spacing.xs,
    },
    statusContainer: {
        position: 'absolute',
        top: 60,
        right: theme.spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: theme.spacing.xs,
    },
    statusText: {
        fontSize: theme.typography.caption,
        color: theme.colors.textSecondary,
    },
    warningBanner: {
        backgroundColor: theme.colors.accentLight,
        padding: theme.spacing.md,
        marginTop: theme.spacing.sm,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    warningText: {
        flex: 1,
        fontSize: theme.typography.caption,
        color: theme.colors.gray900,
    },
    retryText: {
        fontSize: theme.typography.caption,
        color: theme.colors.primary,
        fontWeight: '600',
        paddingLeft: theme.spacing.sm,
    },
    mainAction: {
        padding: theme.spacing.lg,
    },
    captureButton: {
        backgroundColor: theme.colors.primary,
        borderRadius: theme.borderRadius.xl,
        padding: theme.spacing.xl,
        alignItems: 'center',
        ...theme.shadows.lg,
    },
    captureIcon: {
        fontSize: 64,
        marginBottom: theme.spacing.md,
    },
    captureText: {
        fontSize: theme.typography.h4,
        color: theme.colors.white,
        fontWeight: '600',
    },
    captureSubtext: {
        fontSize: theme.typography.body2,
        color: theme.colors.primaryLight,
        marginTop: theme.spacing.xs,
    },
    uploadButton: {
        backgroundColor: theme.colors.secondary,
        borderRadius: theme.borderRadius.xl,
        padding: theme.spacing.lg,
        marginTop: theme.spacing.md,
        alignItems: 'center',
        ...theme.shadows.md,
    },
    uploadIcon: {
        fontSize: 48,
        marginBottom: theme.spacing.sm,
    },
    uploadText: {
        fontSize: theme.typography.h5,
        color: theme.colors.white,
        fontWeight: '600',
    },
    uploadSubtext: {
        fontSize: theme.typography.body2,
        color: 'rgba(255, 255, 255, 0.8)',
        marginTop: theme.spacing.xs,
    },
    featuresContainer: {
        padding: theme.spacing.lg,
        paddingTop: theme.spacing.md,
    },
    sectionTitle: {
        fontSize: theme.typography.h5,
        fontWeight: '600',
        color: theme.colors.textPrimary,
        marginBottom: theme.spacing.md,
    },
    featuresGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    featureCard: {
        width: '48%',
        backgroundColor: theme.colors.white,
        borderRadius: theme.borderRadius.lg,
        padding: theme.spacing.md,
        marginBottom: theme.spacing.md,
        ...theme.shadows.sm,
    },
    featureIcon: {
        fontSize: 32,
        marginBottom: theme.spacing.sm,
    },
    featureTitle: {
        fontSize: theme.typography.body1,
        fontWeight: '600',
        color: theme.colors.textPrimary,
        marginBottom: theme.spacing.xs,
    },
    featureDescription: {
        fontSize: theme.typography.caption,
        color: theme.colors.textSecondary,
        lineHeight: 16,
    },
    infoCard: {
        backgroundColor: theme.colors.primaryLight,
        margin: theme.spacing.lg,
        marginTop: 0,
        padding: theme.spacing.md,
        borderRadius: theme.borderRadius.lg,
    },
    infoTitle: {
        fontSize: theme.typography.h6,
        fontWeight: '600',
        color: theme.colors.primaryDark,
        marginBottom: theme.spacing.sm,
    },
    infoText: {
        fontSize: theme.typography.body2,
        color: theme.colors.gray900,
        lineHeight: 22,
    },
    bottomSpacer: {
        height: theme.spacing.xxl,
    },
});
