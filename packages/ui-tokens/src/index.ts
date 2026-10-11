// Tokeny designu (kolory, typografia, spacing) współdzielone między web i mobile.
export const UI_TOKENS = {
  color: {
    navigation: "#172554",
    action: "#F97316",
    background: "#F8FAFC",
    surface: "#FFFFFF",
    text: "#0F172A",
    mutedText: "#64748B",
    border: "#E2E8F0",
    success: "#15803D",
    warning: "#B45309",
    error: "#B91C1C",
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
} as const;

export type UiTokens = typeof UI_TOKENS;
