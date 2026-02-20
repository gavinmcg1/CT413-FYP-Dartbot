/**
 * Minimal dartboard utilities used by the integration engine.
 */

/** Standard dartboard segment order (clockwise from top) */
export const DARTBOARD_SEGMENTS = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
] as const;

/** Multiplier types */
export type Multiplier = 'S' | 'D' | 'T';
export type Target = `${Multiplier}${number}`;

/** Get next segment clockwise */
export function getNextSegment(segment: number): number {
  const index = DARTBOARD_SEGMENTS.indexOf(segment as typeof DARTBOARD_SEGMENTS[number]);
  if (index === -1) throw new Error(`Invalid segment: ${segment}`);
  return DARTBOARD_SEGMENTS[(index + 1) % DARTBOARD_SEGMENTS.length];
}

/** Get previous segment counter-clockwise */
export function getPrevSegment(segment: number): number {
  const index = DARTBOARD_SEGMENTS.indexOf(segment as typeof DARTBOARD_SEGMENTS[number]);
  if (index === -1) throw new Error(`Invalid segment: ${segment}`);
  return DARTBOARD_SEGMENTS[(index - 1 + DARTBOARD_SEGMENTS.length) % DARTBOARD_SEGMENTS.length];
}
