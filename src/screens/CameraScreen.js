/**
 * Camera screen for capturing ELISA plate images
 * Includes real-time alignment detection — grid turns green when plate is aligned, red when not.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import theme from '../styles/theme';
import PlateOverlay from '../components/PlateOverlay';
import { checkAlignment } from '../services/apiClient';

const ALIGNMENT_CHECK_INTERVAL = 1500; // ms between checks

export default function CameraScreen({ navigation }) {
    const [permission, requestPermission] = useCameraPermissions();
    const [cameraReady, setCameraReady] = useState(false);
    const [capturing, setCapturing] = useState(false);
    const [flash, setFlash] = useState('off');
    const [isAligned, setIsAligned] = useState(null);
    const [alignmentReason, setAlignmentReason] = useState(null);
    const cameraRef = useRef(null);
    const alignmentCheckRef = useRef(null);
    const isCheckingRef = useRef(false);
    const capturingRef = useRef(false);

    useEffect(() => {
        if (permission && !permission.granted && permission.canAskAgain) {
            requestPermission();
        }
    }, [permission]);

    // Start/stop alignment checking when camera is ready
    useEffect(() => {
        if (cameraReady) {
            startAlignmentChecking();
        }
        return () => stopAlignmentChecking();
    }, [cameraReady]);

    const startAlignmentChecking = useCallback(() => {
        stopAlignmentChecking();
        alignmentCheckRef.current = setInterval(async () => {
            if (!cameraRef.current || !cameraReady || capturingRef.current || isCheckingRef.current) return;

            isCheckingRef.current = true;
            let photoUri = null;
            try {
                const photo = await cameraRef.current.takePictureAsync({
                    quality: 0.3,
                    skipProcessing: true,
                });
                photoUri = photo.uri;
                const result = await checkAlignment(photo.uri);
                setIsAligned(result.aligned);
                setAlignmentReason(result.aligned ? null : result.reason);
            } catch (error) {
                // Silently fail — don't disrupt the camera experience
                console.log('Alignment check skipped:', error.message);
            } finally {
                isCheckingRef.current = false;
                if (photoUri) {
                    FileSystem.deleteAsync(photoUri, { idempotent: true }).catch(() => {});
                }
            }
        }, ALIGNMENT_CHECK_INTERVAL);
    }, [cameraReady]);

    const stopAlignmentChecking = useCallback(() => {
        if (alignmentCheckRef.current) {
            clearInterval(alignmentCheckRef.current);
            alignmentCheckRef.current = null;
        }
    }, []);

    const handleCapture = async () => {
        if (!cameraRef.current || !cameraReady || capturingRef.current) return;

        stopAlignmentChecking();
        setCapturing(true);
        capturingRef.current = true;

        try {
            const photo = await cameraRef.current.takePictureAsync({
                quality: 1,
                skipProcessing: false,
            });

            navigation.navigate('Results', { imageUri: photo.uri });
        } catch (error) {
            Alert.alert('Error', 'Failed to capture image. Please try again.');
            console.error('Capture error:', error);
            startAlignmentChecking();
        } finally {
            setCapturing(false);
            capturingRef.current = false;
        }
    };

    const handleGalleryPick = async () => {
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

    const toggleFlash = () => {
        setFlash(current => (current === 'off' ? 'on' : 'off'));
    };

    if (!permission) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        );
    }

    if (!permission.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.permissionText}>Camera permission is required</Text>
                <TouchableOpacity
                    style={styles.button}
                    onPress={requestPermission}
                >
                    <Text style={styles.buttonText}>Grant Permission</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar style="light" />

            <CameraView
                ref={cameraRef}
                style={styles.camera}
                facing="back"
                flash={flash}
                onCameraReady={() => setCameraReady(true)}
            >
                {/* Overlay guide with alignment color feedback */}
                <PlateOverlay isAligned={isAligned} alignmentReason={alignmentReason} />

                {/* Top controls */}
                <View style={styles.topControls}>
                    <TouchableOpacity
                        style={styles.iconButton}
                        onPress={() => navigation.goBack()}
                    >
                        <Text style={styles.iconText}>✕</Text>
                    </TouchableOpacity>

                    <Text style={styles.title}>Align ELISA Plate</Text>

                    <TouchableOpacity
                        style={styles.iconButton}
                        onPress={toggleFlash}
                    >
                        <Text style={styles.iconText}>
                            {flash === 'off' ? '☀' : '⚡'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Instructions */}
                <View style={styles.instructionContainer}>
                    <Text style={styles.instructionText}>
                        Position the ELISA plate within the guide
                    </Text>
                    <Text style={styles.instructionSubtext}>
                        Grid turns green when plate is aligned
                    </Text>
                </View>

                {/* Bottom controls */}
                <View style={styles.bottomControls}>
                    <TouchableOpacity
                        style={styles.galleryButton}
                        onPress={handleGalleryPick}
                    >
                        <Text style={styles.galleryText}>📁</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[
                            styles.captureButton,
                            capturing && styles.captureButtonDisabled,
                        ]}
                        onPress={handleCapture}
                        disabled={!cameraReady || capturing}
                    >
                        {capturing ? (
                            <ActivityIndicator size="small" color={theme.colors.white} />
                        ) : (
                            <View style={[
                                styles.captureButtonInner,
                                isAligned === true && styles.captureButtonAligned,
                            ]} />
                        )}
                    </TouchableOpacity>

                    <View style={styles.spacer} />
                </View>
            </CameraView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme.colors.black,
        justifyContent: 'center',
        alignItems: 'center',
    },
    camera: {
        flex: 1,
        width: '100%',
    },
    permissionText: {
        fontSize: theme.typography.h5,
        color: theme.colors.white,
        textAlign: 'center',
        marginBottom: theme.spacing.lg,
    },
    button: {
        backgroundColor: theme.colors.primary,
        paddingHorizontal: theme.spacing.xl,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.borderRadius.lg,
    },
    buttonText: {
        color: theme.colors.white,
        fontSize: theme.typography.button,
        fontWeight: '600',
    },
    topControls: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.md,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingBottom: theme.spacing.md,
    },
    title: {
        fontSize: theme.typography.h5,
        color: theme.colors.white,
        fontWeight: '600',
    },
    iconButton: {
        width: 44,
        height: 44,
        borderRadius: theme.borderRadius.round,
        backgroundColor: theme.colors.overlayLight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconText: {
        fontSize: 24,
        color: theme.colors.white,
    },
    instructionContainer: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 120 : 100,
        left: 0,
        right: 0,
        paddingHorizontal: theme.spacing.lg,
        alignItems: 'center',
    },
    instructionText: {
        fontSize: theme.typography.body1,
        color: theme.colors.white,
        textAlign: 'center',
        backgroundColor: theme.colors.overlayLight,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.borderRadius.md,
        marginBottom: theme.spacing.xs,
    },
    instructionSubtext: {
        fontSize: theme.typography.caption,
        color: theme.colors.white,
        textAlign: 'center',
    },
    bottomControls: {
        position: 'absolute',
        bottom: 40,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.lg,
    },
    captureButton: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: theme.colors.white,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 4,
        borderColor: theme.colors.primary,
        ...theme.shadows.lg,
    },
    captureButtonDisabled: {
        opacity: 0.6,
    },
    captureButtonInner: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: theme.colors.primary,
    },
    captureButtonAligned: {
        backgroundColor: '#4CAF50',
    },
    galleryButton: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: theme.colors.overlayLight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    galleryText: {
        fontSize: 28,
    },
    spacer: {
        width: 56,
    },
});
