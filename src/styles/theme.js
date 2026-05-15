/**
 * Design system and theme configuration
 */

export const colors = {
    // Primary colors - Medical/Lab theme
    primary: '#2196F3',      // Professional blue
    primaryDark: '#1976D2',
    primaryLight: '#BBDEFB',

    // Secondary colors
    secondary: '#00BCD4',    // Cyan for scientific feel
    secondaryDark: '#0097A7',
    secondaryLight: '#B2EBF2',

    // Accent
    accent: '#FF5722',       // Orange for important actions
    accentLight: '#FFCCBC',

    // Status colors
    success: '#4CAF50',
    warning: '#FF9800',
    error: '#F44336',
    info: '#2196F3',

    // Grayscale
    black: '#000000',
    gray900: '#212121',
    gray800: '#424242',
    gray700: '#616161',
    gray600: '#757575',
    gray500: '#9E9E9E',
    gray400: '#BDBDBD',
    gray300: '#E0E0E0',
    gray200: '#EEEEEE',
    gray100: '#F5F5F5',
    white: '#FFFFFF',

    // Background
    background: '#FAFAFA',
    surface: '#FFFFFF',

    // Text
    textPrimary: '#212121',
    textSecondary: '#757575',
    textDisabled: '#BDBDBD',
    textOnPrimary: '#FFFFFF',

    // Overlay
    overlay: 'rgba(0, 0, 0, 0.5)',
    overlayLight: 'rgba(0, 0, 0, 0.3)',
};

export const typography = {
    // Font families
    regular: 'System',
    medium: 'System',
    bold: 'System',

    // Font sizes
    h1: 32,
    h2: 28,
    h3: 24,
    h4: 20,
    h5: 18,
    h6: 16,
    body1: 16,
    body2: 14,
    caption: 12,
    button: 14,

    // Line heights
    lineHeightTight: 1.2,
    lineHeightNormal: 1.5,
    lineHeightRelaxed: 1.75,
};

export const spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
};

export const borderRadius = {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    round: 9999,
};

export const shadows = {
    sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.18,
        shadowRadius: 1.0,
        elevation: 1,
    },
    md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.23,
        shadowRadius: 2.62,
        elevation: 4,
    },
    lg: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.30,
        shadowRadius: 4.65,
        elevation: 8,
    },
};

export default {
    colors,
    typography,
    spacing,
    borderRadius,
    shadows,
};
