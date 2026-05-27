export const breakpoints = {
  xs: '320px',
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
} as const;

export const mediaQueries = {
  xs: `(min-width: ${breakpoints.xs})`,
  sm: `(min-width: ${breakpoints.sm})`,
  md: `(min-width: ${breakpoints.md})`,
  lg: `(min-width: ${breakpoints.lg})`,
  xl: `(min-width: ${breakpoints.xl})`,
  '2xl': `(min-width: ${breakpoints['2xl']})`,
} as const;

export const gridColumns = {
  xs: 1,
  sm: 2,
  md: 3,
  lg: 4,
  xl: 5,
  '2xl': 6,
} as const;

export function getGridColumns(width: number): number {
  if (width >= 1536) return gridColumns['2xl'];
  if (width >= 1280) return gridColumns.xl;
  if (width >= 1024) return gridColumns.lg;
  if (width >= 768) return gridColumns.md;
  if (width >= 640) return gridColumns.sm;
  return gridColumns.xs;
}
