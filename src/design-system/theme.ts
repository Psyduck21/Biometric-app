import { Platform, type ColorSchemeName } from 'react-native';

export type ThemeMode = 'light' | 'dark';

export type ScreenKey =
    | 'auth'
    | 'verification'
    | 'dashboard'
    | 'logs'
    | 'profile'
    | 'admin'
    | 'states';

export interface AppTheme {
    mode: ThemeMode;
    colors: {
        background: string;
        backgroundAlt: string;
        surface: string;
        surfaceStrong: string;
        surfaceMuted: string;
        overlay: string;
        primary: string;
        primarySoft: string;
        secondary: string;
        text: string;
        textSecondary: string;
        textTertiary: string;
        border: string;
        borderStrong: string;
        success: string;
        warning: string;
        error: string;
        info: string;
        shadow: string;
    };
    spacing: {
        xxs: number;
        xs: number;
        sm: number;
        md: number;
        lg: number;
        xl: number;
        xxl: number;
        xxxl: number;
    };
    radius: {
        sm: number;
        md: number;
        lg: number;
        xl: number;
        xxl: number;
        pill: number;
    };
    typography: {
        family: string | undefined;
        display: {
            fontSize: number;
            lineHeight: number;
            fontWeight: '700' | '800';
            letterSpacing: number;
        };
        heading: {
            fontSize: number;
            lineHeight: number;
            fontWeight: '600' | '700';
            letterSpacing: number;
        };
        body: {
            fontSize: number;
            lineHeight: number;
            fontWeight: '400' | '500' | '600';
            letterSpacing: number;
        };
        label: {
            fontSize: number;
            lineHeight: number;
            fontWeight: '500' | '600';
            letterSpacing: number;
        };
        mono: {
            fontSize: number;
            lineHeight: number;
            fontWeight: '500' | '600';
            letterSpacing: number;
        };
    };
    shadow: {
        card: {
            shadowColor: string;
            shadowOpacity: number;
            shadowRadius: number;
            shadowOffset: { width: number; height: number };
            elevation: number;
        };
        elevated: {
            shadowColor: string;
            shadowOpacity: number;
            shadowRadius: number;
            shadowOffset: { width: number; height: number };
            elevation: number;
        };
    };
    layout: {
        pageMaxWidth: number;
        railWidth: number;
        controlMinHeight: number;
        touchTarget: number;
    };
    motion: {
        fast: number;
        medium: number;
        slow: number;
    };
}

const typographyFamily = Platform.select({
    web: "'Inter', 'SF Pro Display', 'Segoe UI', sans-serif",
    default: undefined,
});

const sharedSpacing = {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
    xxxl: 40,
};

const sharedRadius = {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    xxl: 32,
    pill: 999,
};

const sharedTypography = {
    family: typographyFamily,
    display: {
        fontSize: 34,
        lineHeight: 42,
        fontWeight: '800' as const,
        letterSpacing: -0.6,
    },
    heading: {
        fontSize: 24,
        lineHeight: 30,
        fontWeight: '700' as const,
        letterSpacing: -0.25,
    },
    body: {
        fontSize: 15,
        lineHeight: 22,
        fontWeight: '400' as const,
        letterSpacing: 0,
    },
    label: {
        fontSize: 13,
        lineHeight: 18,
        fontWeight: '600' as const,
        letterSpacing: 0.3,
    },
    mono: {
        fontSize: 12,
        lineHeight: 16,
        fontWeight: '600' as const,
        letterSpacing: 0.5,
    },
};

const sharedMotion = {
    fast: 140,
    medium: 220,
    slow: 320,
};

const sharedLayout = {
    pageMaxWidth: 980,
    railWidth: 248,
    controlMinHeight: 46,
    touchTarget: 44,
};

export const lightTheme: AppTheme = {
    mode: 'light',
    colors: {
        background: '#F5F7FB',
        backgroundAlt: '#EAF0F7',
        surface: '#FFFFFF',
        surfaceStrong: '#E7EEF7',
        surfaceMuted: '#F1F5FA',
        overlay: 'rgba(255, 255, 255, 0.9)',
        primary: '#2563EB',
        primarySoft: '#DBEAFE',
        secondary: '#0F172A',
        text: '#0F172A',
        textSecondary: '#526076',
        textTertiary: '#7B8797',
        border: '#D7E0EA',
        borderStrong: '#B7C4D3',
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#0EA5E9',
        shadow: 'rgba(15, 23, 42, 0.1)',
    },
    spacing: sharedSpacing,
    radius: sharedRadius,
    typography: sharedTypography,
    shadow: {
        card: {
            shadowColor: 'rgba(15, 23, 42, 0.12)',
            shadowOpacity: 0.12,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 8 },
            elevation: 4,
        },
        elevated: {
            shadowColor: 'rgba(15, 23, 42, 0.18)',
            shadowOpacity: 0.18,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 7,
        },
    },
    layout: sharedLayout,
    motion: sharedMotion,
};

export const darkTheme: AppTheme = {
    mode: 'dark',
    colors: {
        background: '#0A1220',
        backgroundAlt: '#0F172A',
        surface: '#111C2E',
        surfaceStrong: '#17233A',
        surfaceMuted: '#0E1728',
        overlay: 'rgba(10, 18, 32, 0.9)',
        primary: '#60A5FA',
        primarySoft: '#12325A',
        secondary: '#E2E8F0',
        text: '#F8FAFC',
        textSecondary: '#CBD5E1',
        textTertiary: '#94A3B8',
        border: '#24344D',
        borderStrong: '#38506F',
        success: '#34D399',
        warning: '#FBBF24',
        error: '#F87171',
        info: '#38BDF8',
        shadow: 'rgba(0, 0, 0, 0.44)',
    },
    spacing: sharedSpacing,
    radius: sharedRadius,
    typography: sharedTypography,
    shadow: {
        card: {
            shadowColor: 'rgba(0, 0, 0, 0.34)',
            shadowOpacity: 0.34,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 10 },
            elevation: 5,
        },
        elevated: {
            shadowColor: 'rgba(0, 0, 0, 0.45)',
            shadowOpacity: 0.45,
            shadowRadius: 28,
            shadowOffset: { width: 0, height: 16 },
            elevation: 8,
        },
    },
    layout: sharedLayout,
    motion: sharedMotion,
};

export function resolveTheme(mode?: ColorSchemeName): AppTheme {
    return mode === 'dark' ? darkTheme : lightTheme;
}
