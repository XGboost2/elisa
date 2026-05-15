/**
 * Plate overlay component for camera guidance
 * Changes color based on plate alignment status:
 *   - Green: plate is aligned with the guide
 *   - Red: plate is not aligned
 *   - Default blue: alignment not yet checked
 */
import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Rect, Line, Circle } from 'react-native-svg';
import theme from '../styles/theme';

const ALIGNED_COLOR = '#4CAF50';       // Green
const NOT_ALIGNED_COLOR = '#F44336';   // Red
const ALIGNED_LIGHT = 'rgba(76, 175, 80, 0.3)';
const NOT_ALIGNED_LIGHT = 'rgba(244, 67, 54, 0.3)';
const DEFAULT_COLOR = theme.colors.primary;
const DEFAULT_LIGHT = theme.colors.primaryLight;

export default function PlateOverlay({ isAligned, alignmentReason }) {
    const { width, height } = useWindowDimensions();

    // Overlay dimensions (96-well plate aspect ratio ~3:2)
    const overlayWidth = width * 0.85;
    const overlayHeight = overlayWidth * (2 / 3);
    const overlayX = (width - overlayWidth) / 2;
    const overlayY = height * 0.3;

    // Grid configuration (8 rows × 12 columns)
    const rows = 8;
    const cols = 12;
    const cellWidth = overlayWidth / cols;
    const cellHeight = overlayHeight / rows;

    // Pick colors based on alignment state
    let guideColor, gridColor, cornerColor;
    if (isAligned === true) {
        guideColor = ALIGNED_COLOR;
        gridColor = ALIGNED_LIGHT;
        cornerColor = ALIGNED_COLOR;
    } else if (isAligned === false) {
        guideColor = NOT_ALIGNED_COLOR;
        gridColor = NOT_ALIGNED_LIGHT;
        cornerColor = NOT_ALIGNED_COLOR;
    } else {
        // null/undefined = not yet checked
        guideColor = DEFAULT_COLOR;
        gridColor = DEFAULT_LIGHT;
        cornerColor = theme.colors.accent;
    }

    return (
        <View style={styles.container}>
            <Svg width={width} height={height} style={styles.svg}>
                {/* Semi-transparent overlay outside the guide */}
                <Rect
                    x="0"
                    y="0"
                    width={width}
                    height={overlayY}
                    fill="rgba(0, 0, 0, 0.5)"
                />
                <Rect
                    x="0"
                    y={overlayY + overlayHeight}
                    width={width}
                    height={height - (overlayY + overlayHeight)}
                    fill="rgba(0, 0, 0, 0.5)"
                />
                <Rect
                    x="0"
                    y={overlayY}
                    width={overlayX}
                    height={overlayHeight}
                    fill="rgba(0, 0, 0, 0.5)"
                />
                <Rect
                    x={overlayX + overlayWidth}
                    y={overlayY}
                    width={overlayX}
                    height={overlayHeight}
                    fill="rgba(0, 0, 0, 0.5)"
                />

                {/* Main guide rectangle */}
                <Rect
                    x={overlayX}
                    y={overlayY}
                    width={overlayWidth}
                    height={overlayHeight}
                    stroke={guideColor}
                    strokeWidth="3"
                    fill="transparent"
                    strokeDasharray={isAligned === true ? undefined : "10,5"}
                />

                {/* Corner markers */}
                {[
                    [overlayX, overlayY],
                    [overlayX + overlayWidth, overlayY],
                    [overlayX, overlayY + overlayHeight],
                    [overlayX + overlayWidth, overlayY + overlayHeight],
                ].map(([x, y], index) => (
                    <Circle
                        key={index}
                        cx={x}
                        cy={y}
                        r="6"
                        fill={cornerColor}
                        stroke={theme.colors.white}
                        strokeWidth="2"
                    />
                ))}

                {/* Grid lines (subtle) */}
                {/* Vertical lines */}
                {Array.from({ length: cols - 1 }).map((_, i) => (
                    <Line
                        key={`v-${i}`}
                        x1={overlayX + (i + 1) * cellWidth}
                        y1={overlayY}
                        x2={overlayX + (i + 1) * cellWidth}
                        y2={overlayY + overlayHeight}
                        stroke={gridColor}
                        strokeWidth="1"
                        opacity="0.5"
                    />
                ))}

                {/* Horizontal lines */}
                {Array.from({ length: rows - 1 }).map((_, i) => (
                    <Line
                        key={`h-${i}`}
                        x1={overlayX}
                        y1={overlayY + (i + 1) * cellHeight}
                        x2={overlayX + overlayWidth}
                        y2={overlayY + (i + 1) * cellHeight}
                        stroke={gridColor}
                        strokeWidth="1"
                        opacity="0.5"
                    />
                ))}
            </Svg>

            {/* Alignment status text */}
            {isAligned !== null && isAligned !== undefined && (
                <View style={[
                    styles.statusBadge,
                    { backgroundColor: isAligned ? ALIGNED_COLOR : NOT_ALIGNED_COLOR }
                ]}>
                    <Text style={styles.statusText}>
                        {isAligned ? '✓ Aligned' : alignmentReason || 'Not aligned'}
                    </Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        pointerEvents: 'none',
    },
    svg: {
        position: 'absolute',
    },
    statusBadge: {
        position: 'absolute',
        bottom: 140,
        alignSelf: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    statusText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
});
