import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import theme from '../styles/theme';

export function getColorFromOD(od) {
    const normalizedOD = Math.min(Math.max(od, 0), 2) / 2;
    const r = Math.floor(255 * (1 - normalizedOD));
    const g = Math.floor(255 * (1 - normalizedOD * 0.5));
    const b = Math.floor(100 + 155 * normalizedOD);
    return `rgb(${r}, ${g}, ${b})`;
}

function getTextColorForOD(od) {
    const normalizedOD = Math.min(Math.max(od, 0), 2) / 2;
    return normalizedOD < 0.45 ? '#333333' : '#FFFFFF';
}

export default function WellHeatmap({ wells }) {
    const { width } = useWindowDimensions();

    const grid = Array(8).fill(null).map(() => Array(12).fill(null));

    wells.forEach(well => {
        if (well.row < 8 && well.col < 12) {
            grid[well.row][well.col] = well;
        }
    });

    const cellWidth = (width - theme.spacing.md * 4) / 12;
    const rowLabels = 'ABCDEFGH';

    return (
        <View style={styles.container}>
            <View style={styles.columnLabelsRow}>
                <View style={[styles.labelCell, { width: cellWidth }]} />
                {Array.from({ length: 12 }).map((_, i) => (
                    <View key={i} style={[styles.labelCell, { width: cellWidth }]}>
                        <Text style={styles.labelText}>{i + 1}</Text>
                    </View>
                ))}
            </View>

            {grid.map((row, rowIndex) => (
                <View key={rowIndex} style={styles.row}>
                    <View style={[styles.labelCell, { width: cellWidth }]}>
                        <Text style={styles.labelText}>{rowLabels[rowIndex]}</Text>
                    </View>

                    {row.map((well, colIndex) => (
                        <View
                            key={colIndex}
                            style={[
                                styles.cell,
                                { width: cellWidth, height: cellWidth },
                                well && { backgroundColor: getColorFromOD(well.optical_density) }
                            ]}
                        >
                            {well && (
                                <Text
                                    style={[
                                        styles.cellText,
                                        { color: getTextColorForOD(well.optical_density) }
                                    ]}
                                    numberOfLines={1}
                                >
                                    {well.optical_density.toFixed(2)}
                                </Text>
                            )}
                        </View>
                    ))}
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingVertical: theme.spacing.sm,
    },
    columnLabelsRow: {
        flexDirection: 'row',
        marginBottom: theme.spacing.xs,
    },
    row: {
        flexDirection: 'row',
        marginBottom: 2,
    },
    labelCell: {
        aspectRatio: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    labelText: {
        fontSize: 10,
        color: theme.colors.textSecondary,
        fontWeight: '600',
    },
    cell: {
        marginRight: 2,
        borderRadius: theme.borderRadius.sm,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme.colors.gray200,
        borderWidth: 1,
        borderColor: theme.colors.gray300,
    },
    cellText: {
        fontSize: 8,
        fontWeight: '600',
        textShadowColor: 'rgba(0, 0, 0, 0.2)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 1,
    },
});
