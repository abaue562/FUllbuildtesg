// CanvassCRM design system — Jobber-style.
// Clean white surfaces, deep navy text, green CTAs, soft warm background.
export const theme = {
  color: {
    bg:         "#F5F5F0",   // app background (warm off-white)
    surface:    "#FFFFFF",   // cards
    surfaceAlt: "#F0F0EA",   // pressed / chips
    text:       "#0E2B2A",   // primary text (deep navy-teal)
    textMute:   "#5A6B6A",   // secondary text
    border:     "#E5E5DF",
    primary:    "#3A8540",   // CTA green (Clock In, Save)
    primaryDark:"#2E6A33",
    accent:     "#2E7D32",   // links / arrows
    danger:     "#E04A3F",   // logout, past-due, errors
    warning:    "#E8A53A",   // callback amber
    info:       "#2D7CB8",
    fabBg:      "#1F3534",   // dark FAB
  },
  radius: { sm: 8, md: 12, lg: 16, pill: 999 },
  space:  { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  font: {
    h1: 30, h2: 22, h3: 18, body: 16, small: 13, micro: 11,
  },
};

// Door pin colors mapped into the same palette
export const doorColor: Record<string, string> = {
  unknocked:      "#9CA3A3",
  no_answer:      "#7B8C8B",
  not_home:       "#A8B5B4",
  callback:       theme.color.warning,
  interested:     theme.color.info,
  sold:           theme.color.primary,
  not_interested: theme.color.danger,
  dnc:            "#1F3534",
  no_soliciting:  "#7C3AED",
};
