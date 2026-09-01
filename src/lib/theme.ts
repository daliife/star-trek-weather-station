export const themes = ['classic', 'voyager', 'nemesis'] as const;

export type ConsoleTheme = (typeof themes)[number];

export function isTheme(value: string | null | undefined): value is ConsoleTheme {
  return value === 'classic' || value === 'voyager' || value === 'nemesis';
}
