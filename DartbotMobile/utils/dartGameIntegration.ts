/**
 * Dart Game Integration Module
 * Data-driven bot using empirical miss distributions and skill-based accuracy
 */

import { Target, getNextSegment, getPrevSegment } from './dartPhysics';

/**
 * Empirical miss distribution when T20 is missed
 * Based on real darts data
 */
const DEFAULT_EMPIRICAL_MISS_DIST: Record<string, number> = {
  i20: 0.34700665188470065,
  o5: 0.04434589800443459,
  o20: 0.33148558758314856,
  t5: 0.019955654101995565,
  i5: 0.05321507760532151,
  t1: 0.028824833702882482,
  bounceout: 0.009977827050997782,
  i1: 0.05432372505543237,
  o12: 0.007760532150776054,
  o1: 0.04434589800443459,
  i9: 0.004434589800443459,
  i12: 0.013303769401330377,
  i14: 0.0033259423503325942,
  i11: 0.0022172949002217295,
  i18: 0.005543237250554324,
  t12: 0.0022172949002217295,
  i4: 0.0066518847006651885,
  i8: 0.0022172949002217295,
  o18: 0.004434589800443459,
  d1: 0.0011086474501108647,
  o6: 0.0011086474501108647,
  t18: 0.0022172949002217295,
  obull: 0.0011086474501108647,
  m20: 0.004434589800443459,
  d20: 0.0022172949002217295,
  d5: 0.0022172949002217295,
};

type SimulationResultsData = {
  model?: { slope: number; intercept: number };
  bins?: Record<string, any>;
  empirical_miss_dist?: Record<string, number>;
};

let simulationResults: SimulationResultsData | null = null;
let currentAverageRange: string | null = null;

export function setSimulationResults(data: SimulationResultsData | null, averageRange?: string) {
  simulationResults = data;
  if (averageRange) currentAverageRange = averageRange;
}

export function setAverageRangeForSimulation(averageRange: string) {
  currentAverageRange = averageRange;
}

/**
 * Map empirical bed names to dartboard segments
 */
const BED_TO_SEGMENT: Record<string, number> = {
  // Singles (inner ring)
  i1: 1, i5: 5, i12: 12, i14: 14, i18: 18, i20: 20, i4: 4, i8: 8, i9: 9, i11: 11,
  // Doubles
  d1: 1, d5: 5, d20: 20,
  // Triples
  t1: 1, t5: 5, t12: 12, t18: 18,
  // Outer singles
  o1: 1, o5: 5, o6: 6, o12: 12, o18: 18, o20: 20,
  // Bull
  obull: 25, // Outer bull = 25
  // Miss
  bounceout: 0,
  m20: 20, // Miss near 20
};

/**
 * Map empirical bed to multiplier and segment
 */
function mapBedToTarget(bed: string): Target | null {
  // Inner singles
  if (bed.startsWith('i')) {
    const seg = BED_TO_SEGMENT[bed];
    if (seg && seg !== 25) return `S${seg}` as Target;
  }
  // Doubles
  if (bed.startsWith('d')) {
    const seg = BED_TO_SEGMENT[bed];
    if (seg) return `D${seg}` as Target;
  }
  // Triples
  if (bed.startsWith('t')) {
    const seg = BED_TO_SEGMENT[bed];
    if (seg) return `T${seg}` as Target;
  }
  // Outer singles
  if (bed.startsWith('o')) {
    if (bed === 'obull') return 'S25' as Target; // Outer bull = 25
    const seg = BED_TO_SEGMENT[bed];
    if (seg && seg !== 25) return `S${seg}` as Target;
  }
  // Miss
  if (bed === 'bounceout' || bed === 'm20') return null;
  return null;
}

/**
 * Get hit probability for T20 based on skill level
 * Skill 1-5: 5-15% hit rate
 * Skill 6-10: 15-40% hit rate
 * Skill 11-15: 40-70% hit rate
 * Skill 16-18: 70-95% hit rate
 */
export function getT20HitProbability(skillLevel: number): number {
  const binProb = currentAverageRange && simulationResults?.bins?.[currentAverageRange]?.predicted_p_hit_per_dart;
  if (typeof binProb === 'number') return Math.max(0.02, Math.min(0.98, binProb));
  // Linear interpolation: skill 1->5%, skill 18->90%
  return 0.05 + (skillLevel - 1) / 17 * 0.85;
}

/**
 * Get hit probability for S20 based on skill level
 * L1 around 10-15%, L18 around 95%
 */
function getS20HitProbability(skillLevel: number): number {
  const s20HitByLevel: Record<number, number> = {
    1: 0.12,
    2: 0.14,
    3: 0.16,
    4: 0.20,
    5: 0.26,
    6: 0.32,
    7: 0.38,
    8: 0.45,
    9: 0.52,
    10: 0.60,
    11: 0.68,
    12: 0.74,
    13: 0.80,
    14: 0.85,
    15: 0.89,
    16: 0.92,
    17: 0.94,
    18: 0.95,
  };
  return s20HitByLevel[skillLevel] ?? 0.60;
}

/**
 * Get hit probability for a specific target based on skill and multiplier
 */
function getTargetHitProbability(skillLevel: number, target: Target): number {
  if (target === 'S20') return getS20HitProbability(skillLevel);
  const base = getT20HitProbability(skillLevel);
  const mult = target[0];
  if (mult === 'S') return Math.min(0.98, base * 1.25);
  if (mult === 'D') return Math.max(0.02, base * 0.75);
  return base; // Triple
}

/**
 * Get variance probability by skill level
 * Non-linear distribution: L1=2%, L3=4%, L16=36%, L18=40%
 * Reflects that even elite players make deliberate adjustments
 */
function getVarianceProbabilityForLevel(skillLevel: number): number {
  const varianceByLevel: Record<number, number> = {
    1: 0.02,   // 2%
    2: 0.025,  // 2.5%
    3: 0.04,   // 4%
    4: 0.05,   // 5%
    5: 0.07,   // 7%
    6: 0.09,   // 9%
    7: 0.12,   // 12%
    8: 0.14,   // 14%
    9: 0.17,   // 17%
    10: 0.20,  // 20%
    11: 0.24,  // 24%
    12: 0.27,  // 27%
    13: 0.30,  // 30%
    14: 0.32,  // 32%
    15: 0.34,  // 34%
    16: 0.36,  // 36%
    17: 0.38,  // 38%
    18: 0.40,  // 40%
  };
  return varianceByLevel[skillLevel] ?? 0.20; // Default fallback
}

/**
 * Apply variance to checkout target based on skill level
 * Lower skill levels play less predictably; higher skill levels mostly follow recommendations
 * Returns the intended target after variance is applied
 */
export function applyIntendedHitVariance(
  recommendedTarget: Target,
  skillLevel: number,
  remainingScore: number
): Target {
  // Get variance probability for this skill level
  const varianceProbability = getVarianceProbabilityForLevel(skillLevel);
  const varianceRoll = Math.random();

  // If variance roll is within probability, apply variance
  if (varianceRoll < varianceProbability) {
    // Determine variance strategy (2 approaches)
    const strategyRoll = Math.random();

    if (strategyRoll < 0.5) {
      // Strategy 1: Play safer - downgrade difficulty
      const mult = recommendedTarget[0];
      const segment = parseInt(recommendedTarget.slice(1), 10);

      if (mult === 'T') {
        // Downgrade triple to single
        return `S${segment}` as Target;
      }
    } else {
      // Strategy 2: Adjust segment within the same multiplier
      const mult = recommendedTarget[0];
      const segment = parseInt(recommendedTarget.slice(1), 10);

      // Try adjacent segments (neighbors on dartboard)
      const adjacentRoll = Math.random();
      let newSegment = segment;

      if (adjacentRoll < 0.5) {
        newSegment = getNextSegment(segment);
      } else {
        newSegment = getPrevSegment(segment);
      }

      return `${mult}${newSegment}` as Target;
    }
  }

  return recommendedTarget;
}

/**
 * Sample a miss destination from empirical distribution
 */
function getMissDistribution(): Record<string, number> {
  const binDist = currentAverageRange && simulationResults?.bins?.[currentAverageRange]?.miss_bed_distribution;
  if (binDist) return binDist as Record<string, number>;
  if (simulationResults?.empirical_miss_dist) return simulationResults.empirical_miss_dist;
  return DEFAULT_EMPIRICAL_MISS_DIST;
}

function sampleMissDestination(): Target | null {
  const missDist = getMissDistribution();
  const random = Math.random();
  let cumulative = 0;

  for (const [bed, prob] of Object.entries(missDist)) {
    cumulative += prob;
    if (random <= cumulative) {
      return mapBedToTarget(bed);
    }
  }

  // Fallback
  return null;
}

/**
 * Sample a miss destination around a target segment
 * For segment 20, use empirical data; otherwise use neighboring singles
 */
function sampleMissDestinationForSegment(segment: number): Target {
  if (segment === 20) {
    return sampleMissDestination() ?? ('S20' as Target);
  }

  const roll = Math.random();
  if (roll < 0.6) return `S${segment}` as Target;
  if (roll < 0.8) return `S${getPrevSegment(segment)}` as Target;
  return `S${getNextSegment(segment)}` as Target;
}

/**
 * Single dart result
 */
export interface BotDartThrow {
  intended: Target;
  actual: Target | null;
  score: number;
  hitProbability: number;
  actualHit: boolean;
}

/**
 * Simulate a single dart throw at T20
 */
function simulateSingleDart(skillLevel: number, intended: Target): BotDartThrow {
  const hitProb = getTargetHitProbability(skillLevel, intended);
  const didHit = Math.random() < hitProb;

  if (didHit) {
    return {
      intended,
      actual: intended,
      score: calculateScore(intended),
      hitProbability: hitProb,
      actualHit: true,
    };
  }

  // Miss - use empirical distribution for segment 20, otherwise neighbors
  const segmentMatch = intended.match(/^([SDT])(\d+)$/);
  const segment = segmentMatch ? parseInt(segmentMatch[2], 10) : 20;
  const missTarget = sampleMissDestinationForSegment(segment);
  const missScore = calculateScore(missTarget);

  return {
    intended,
    actual: missTarget,
    score: missScore,
    hitProbability: hitProb,
    actualHit: false,
  };
}

/**
 * Exported single-dart simulation for a specific intended target
 */
export function simulateDartAtTarget(skillLevel: number, intended: Target): BotDartThrow {
  return simulateSingleDart(skillLevel, intended);
}

/**
 * Calculate score from target
 */
function calculateScore(target: Target | null): number {
  if (!target) return 0;

  const match = target.match(/^([SDT])(\d+)$/);
  if (!match) return 0;

  const [, mult, segStr] = match;
  const segment = parseInt(segStr, 10);
  const multipliers: Record<string, number> = { S: 1, D: 2, T: 3 };

  return segment * multipliers[mult];
}

/**
 * Simulate a complete bot turn (up to 3 darts at T20)
 * Each dart is independent - bot always aims for T20
 */
export function simulateBotTurn(
  skillLevel: number,
  remainingScore: number,
  outRule: 'straight' | 'double'
): {
  darts: BotDartThrow[];
  totalScore: number;
  finished: boolean;
} {
  const darts: BotDartThrow[] = [];
  let turnScore = 0;

  // Simulate up to 3 darts
  for (let i = 0; i < 3; i++) {
    const baseTarget = 'T20' as Target;
    const intendedTarget = applyIntendedHitVariance(baseTarget, skillLevel, remainingScore);
    const dart = simulateSingleDart(skillLevel, intendedTarget);
    darts.push(dart);

    const newTurnScore = turnScore + dart.score;

    // Check for bust
    if (newTurnScore > remainingScore) {
      // Bust - return 0
      return {
        darts,
        totalScore: 0,
        finished: false,
      };
    }

    turnScore = newTurnScore;

    // Check if finished
    if (newTurnScore === remainingScore) {
      if (outRule === 'double') {
        // In double-out, must finish on a double
        const isDouble = dart.actual && dart.actual[0] === 'D';
        if (!isDouble) {
          // Didn't finish on double - bust
          return {
            darts,
            totalScore: 0,
            finished: false,
          };
        }
      }
      // Finished
      return {
        darts,
        totalScore: turnScore,
        finished: true,
      };
    }

    // Check for 1 remaining in double-out
    if (outRule === 'double' && newTurnScore === remainingScore - 1) {
      // Can't finish (would need exactly a double 1 remaining)
      return {
        darts,
        totalScore: 0,
        finished: false,
      };
    }
  }

  return {
    darts,
    totalScore: turnScore,
    finished: false,
  };
}

/**
 * Simulate a checkout turn using a specific recommended route
 * Each dart follows the intended sequence; actual hits/misses still apply
 */
export function simulateCheckoutTurn(
  skillLevel: number,
  remainingScore: number,
  outRule: 'straight' | 'double',
  sequence: string[] | string
): {
  darts: BotDartThrow[];
  totalScore: number;
  finished: boolean;
} {
  const seq = Array.isArray(sequence) ? sequence : sequence.split('|');
  const darts: BotDartThrow[] = [];
  let turnScore = 0;

  for (let i = 0; i < 3; i++) {
    const intended = parseCheckoutTarget(seq[i] ?? 't20');
    const dart = simulateSingleDart(skillLevel, intended);
    darts.push(dart);

    const newTurnScore = turnScore + dart.score;
    if (newTurnScore > remainingScore) {
      return { darts, totalScore: 0, finished: false };
    }
    turnScore = newTurnScore;

    if (newTurnScore === remainingScore) {
      if (outRule === 'double') {
        const isDouble = dart.actual && dart.actual[0] === 'D';
        if (!isDouble) return { darts, totalScore: 0, finished: false };
      }
      return { darts, totalScore: turnScore, finished: true };
    }

    if (outRule === 'double' && newTurnScore === remainingScore - 1) {
      return { darts, totalScore: 0, finished: false };
    }
  }

  return { darts, totalScore: turnScore, finished: false };
}

/**
 * Format bot dart throws for display
 */
export function formatBotDarts(darts: BotDartThrow[]): string {
  return darts
    .map((dart) => `${dart.intended}->${dart.actual || 'MISS'}(${dart.actualHit ? '✓' : '✗'}) +${dart.score}`)
    .join(' | ');
}

/**
 * Map level (1-18) to checkout average range bin
 */
export function getAverageRangeForLevel(level: number): string {
  if (level <= 4) return '30-39';
  if (level <= 6) return '40-49';
  if (level <= 8) return '50-59';
  if (level <= 10) return '60-69';
  if (level <= 12) return '70-79';
  if (level <= 14) return '80-89';
  if (level <= 16) return '90-99';
  return '100-109';
}

/**
 * Parse checkout sequence entry to Target
 */
export function parseCheckoutTarget(input: string): Target {
  const bed = input.toLowerCase();
  if (bed === 'ibull') return 'S50' as Target;
  if (bed === 'obull') return 'S25' as Target;

  const match = bed.match(/^([odtsi])(\d+)$/);
  if (!match) return 'T20' as Target;

  const [, mult, num] = match;
  const segment = parseInt(num, 10);
  if (segment < 1 || segment > 20) return 'T20' as Target;

  switch (mult) {
    case 'd':
      return `D${segment}` as Target;
    case 't':
      return `T${segment}` as Target;
    case 's':
    case 'o':
    case 'i':
      return `S${segment}` as Target;
    default:
      return 'T20' as Target;
  }
}

/**
 * Get checkout probability (unused for now, simplified approach)
 */
export function getBotCheckoutProbability(
  score: number,
  skillLevel: number,
  outRule: 'straight' | 'double'
): number {
  const hitProb = getT20HitProbability(skillLevel);
  return Math.pow(hitProb, 2); // Roughly 2 T20s to finish
}
