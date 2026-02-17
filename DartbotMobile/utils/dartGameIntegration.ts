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

type DoubleOutcomeEntry = {
  hit_double?: number;
  miss_inside?: number;
  miss_outside?: number;
  neighbor_singledouble?: number;
  other?: number;
  samples?: number;
};

type DoubleOutcomesData = {
  bins?: Record<string, Record<string, DoubleOutcomeEntry>>;
};

let simulationResults: SimulationResultsData | null = null;
let currentAverageRange: string | null = null;
let doubleOutcomesResults: DoubleOutcomesData | null = null;

export function setSimulationResults(data: SimulationResultsData | null, averageRange?: string) {
  simulationResults = data;
  if (averageRange) currentAverageRange = averageRange;
}

export function setAverageRangeForSimulation(averageRange: string) {
  currentAverageRange = averageRange;
}

export function setDoubleOutcomesResults(data: DoubleOutcomesData | null) {
  doubleOutcomesResults = data;
}

function getDoubleOutcomeForSegment(segment: number): DoubleOutcomeEntry | null {
  if (!currentAverageRange || !doubleOutcomesResults?.bins) return null;
  const binData = doubleOutcomesResults.bins[currentAverageRange];
  if (!binData) return null;
  return binData[`d${segment}`] ?? null;
}

function getInnerBullOutcome(): DoubleOutcomeEntry | null {
  if (!currentAverageRange || !doubleOutcomesResults?.bins) return null;
  const binData = doubleOutcomesResults.bins[currentAverageRange];
  if (!binData) return null;
  return binData.ibull ?? null;
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
 * Get base hit probability for T20 from API (without skill scaling)
 * This is used as the reference for calculating other target probabilities
 */
function getT20BaseHitProbability(): number {
  const binProb = currentAverageRange && simulationResults?.bins?.[currentAverageRange]?.predicted_p_hit_per_dart;
  
  if (typeof binProb === 'number') {
    return Math.max(0.02, Math.min(0.98, binProb));
  }
  
  console.warn('[T20HitProb] Simulation data not available, using fallback probability');
  return 0.5; // Default 50% hit rate as fallback
}

/**
 * Get hit probability for T20 based on skill level
 * Uses empirical data from simulation results loaded via API
 * Applies skill-based scaling: low skill significantly reduced, high skill kept/increased
 * NOTE: Only T20 gets this scaling. Other targets use the unscaled base.
 */
export function getT20HitProbability(skillLevel: number): number {
  const baseProb = getT20BaseHitProbability();
  
  // Apply skill-based scaling to the API probability
  // Low skill (1-8): significantly reduced accuracy for consistency
  // High skill (14-18): kept at API level or slightly boosted
  const skillFactor = (skillLevel - 1) / 17; // 0 to 1
  
  // Non-linear skill curve that heavily penalizes low skill
  // Skill 1: ~40% of API probability
  // Skill 5: ~55% of API probability
  // Skill 9: ~75% of API probability
  // Skill 14: ~90% of API probability
  // Skill 18: ~105% of API probability
  const skillMultiplier = 0.40 + (skillFactor * 0.65);
  
  const scaledProb = baseProb * skillMultiplier;
  return Math.max(0.02, Math.min(0.98, scaledProb));
}

/**
 * Get hit probability for S20 based on skill level
 * L1 around 10-15%, L18 around 95%
 * Reduced for lower levels to prevent over-scoring
 */
function getS20HitProbability(skillLevel: number): number {
  const s20HitByLevel: Record<number, number> = {
    1: 0.10,
    2: 0.12,
    3: 0.14,
    4: 0.16,
    5: 0.22,
    6: 0.28,
    7: 0.35,
    8: 0.42,
    9: 0.50,
    10: 0.58,
    11: 0.66,
    12: 0.73,
    13: 0.79,
    14: 0.84,
    15: 0.88,
    16: 0.91,
    17: 0.94,
    18: 0.95,
  };
  return s20HitByLevel[skillLevel] ?? 0.58;
}

/**
 * Get hit probability for a specific target based on skill and multiplier
 * Low-skill: frequent T20 misses, struggle with doubles, hit singles often
 * High-skill: consistent T20 hits, excellent doubles, singles are misses
 * 
 * NOTE: Uses BASE (unscaled) API probability for calculating multipliers,
 * but T20 itself uses the skill-scaled probability
 */
function getTargetHitProbability(skillLevel: number, target: Target): number {
  if (target === 'S20') return getS20HitProbability(skillLevel);
  
  // Use the UNSCALED base API probability for calculating other targets
  // This prevents double-reduction where skill penalty applies twice
  const base = getT20BaseHitProbability();
  const mult = target[0];
  
  // Special handling for bulls - they're smaller targets, harder to hit
  // Skill-based scaling: worse players hit them less often
  const skillFactor = (skillLevel - 1) / 17; // 0 to 1, where 1 is skill 18
  
  // S50 = inner bull (smallest, hardest)
  // Prefer bin-specific empirical probability from double_outcomes (ibull)
  if (target === 'S50') {
    const innerBullOutcome = getInnerBullOutcome();
    if (innerBullOutcome && typeof innerBullOutcome.hit_double === 'number') {
      return Math.max(0.01, Math.min(0.35, innerBullOutcome.hit_double));
    }

    // Fallback curve if ibull data is unavailable
    // Skill 1 ≈ 1.5%, Skill 10 ≈ 7.6%, Skill 18 ≈ 13.0%
    const s50Probability = 0.015 + (skillFactor * 0.115);
    return Math.max(0.01, Math.min(0.13, s50Probability));
  }
  
  // S25 = outer bull (larger than inner, but still small)
  // Keep lower than standard singles, but higher than inner bull.
  // Skill 1 ≈ 6%, Skill 10 ≈ 14.5%, Skill 18 ≈ 22%
  if (target === 'S25') {
    const s25Probability = 0.06 + (skillFactor * 0.16);
    return Math.max(0.03, Math.min(0.22, s25Probability));
  }
  
  // Regular singles: Low-skill players hit singles more often (less accurate at T20)
  // High-skill players are more consistent at T20, singles are "misses"
  // Low skill: 1.25x, High skill: 0.95x
  const singleMultiplier = 1.25 - (skillFactor * 0.30);
  if (mult === 'S') return Math.min(0.98, base * singleMultiplier);
  
  // Doubles: High-skill players are MUCH BETTER at doubles
  // Doubles require precision and are the skill differentiator at checkout
  // Applied to UNSCALED base so high-skill gets full advantage
  // Low skill: 0.30x (terrible at doubles), High skill: 1.45x (excellent at doubles)
  if (mult === 'D') {
    const lowLevelDoublePenaltyByLevel: Record<number, number> = {
      1: 0.70,
      2: 0.75,
      3: 0.80,
      4: 0.85,
      5: 0.90,
      6: 0.95,
    };
    const lowLevelPenalty = lowLevelDoublePenaltyByLevel[skillLevel] ?? 1.0;

    const segment = parseInt(target.slice(1), 10);
    const doubleOutcome = Number.isFinite(segment) ? getDoubleOutcomeForSegment(segment) : null;
    if (doubleOutcome && typeof doubleOutcome.hit_double === 'number') {
      return Math.max(0.02, Math.min(0.98, doubleOutcome.hit_double * lowLevelPenalty));
    }

    const doubleMultiplier = 0.30 + (skillFactor * 1.15);
    return Math.max(0.02, base * doubleMultiplier * lowLevelPenalty);
  }
  
  // Triples
  return base;
}

/**
 * Get variance probability by skill level
 * Non-linear distribution with higher low-skill variance and tighter high-skill aiming:
 * L1=12%, L3=18%, L10=22%, L16=8%, L18=4%
 * Elite players mostly stick to intended targets.
 */
function getVarianceProbabilityForLevel(skillLevel: number): number {
  const varianceByLevel: Record<number, number> = {
    1: 0.12,   // 12%
    2: 0.15,   // 15%
    3: 0.18,   // 18%
    4: 0.20,   // 20%
    5: 0.22,   // 22%
    6: 0.24,   // 24%
    7: 0.25,   // 25%
    8: 0.25,   // 25%
    9: 0.24,   // 24%
    10: 0.22,  // 22%
    11: 0.18,  // 18%
    12: 0.16,  // 16%
    13: 0.14,  // 14%
    14: 0.12,  // 12%
    15: 0.10,  // 10%
    16: 0.08,  // 8%
    17: 0.06,  // 6%
    18: 0.04,  // 4%
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
 * High-skill players miss closer to T20 (filter out far misses)
 */
function getMissDistribution(skillLevel: number = 10): Record<string, number> {
  const binDist = currentAverageRange && simulationResults?.bins?.[currentAverageRange]?.miss_bed_distribution;
  const baseDist = binDist || simulationResults?.empirical_miss_dist || DEFAULT_EMPIRICAL_MISS_DIST;
  
  // For high-skill players, filter out far misses (1's, low segments)
  // Keep close misses (i20, o20, t5, o5, i5, t1, i1)
  const skillFactor = (skillLevel - 1) / 17; // 0 to 1
  
  if (skillFactor < 0.5) {
    // Low skill: use full distribution
    return baseDist as Record<string, number>;
  }

  // High skill: reweight and renormalize
  // At top levels, misses should cluster around 20 and only rarely drift to neighboring singles.
  const core20Beds = new Set(['i20', 'o20', 'd20', 'm20']);
  const neighborTripleBeds = new Set(['t5', 't1']);
  const neighborSingleBeds = new Set(['i5', 'o5', 'i1', 'o1']);
  const bounceBeds = new Set(['bounceout']);
  const filtered: Record<string, number> = {};
  let total = 0;
  
  for (const [bed, prob] of Object.entries(baseDist)) {
    const probNum = prob as number;
    let weight = 1;

    if (core20Beds.has(bed)) {
      // Boost center-20 misses as skill rises
      weight = 1 + (1.2 * skillFactor);
    } else if (neighborTripleBeds.has(bed)) {
      // Keep some near-neighbor triples
      weight = 0.45 - (0.15 * skillFactor);
    } else if (neighborSingleBeds.has(bed)) {
      // Strongly suppress neighboring singles at high levels
      // L18 ~18% of original weight
      weight = 0.55 - (0.37 * skillFactor);
    } else if (bounceBeds.has(bed)) {
      weight = 0.18 - (0.08 * skillFactor);
    } else {
      // Far misses decay steeply with skill
      weight = 0.40 - (0.35 * skillFactor);
    }

    const adjusted = probNum * Math.max(0.01, weight);
    filtered[bed] = adjusted;
    total += adjusted;
  }
  
  // Renormalize
  for (const bed in filtered) {
    filtered[bed] /= total;
  }
  
  return filtered;
}

function sampleMissDestination(skillLevel: number = 10): Target | null {
  const missDist = getMissDistribution(skillLevel);
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
 * Special handling for bulls (50 and 25) with skill-based probabilities for IBULL only
 */
function sampleMissDestinationForSegment(
  segment: number,
  isBullTarget: boolean = false,
  isCheckoutSetup: boolean = false,
  skillLevel: number = 10,
  intendedMult: 'S' | 'D' | 'T' = 'S'
): Target | null {
  // Special handling for bullseye targets with skill-based miss behavior
  if (isBullTarget) {
    // Calculate skill-based probabilities (scale from 1-18)
    const skillFactor = (skillLevel - 1) / 17; // 0 to 1, where 1 is skill 18
    
    // Aiming for inner bull (50) - skill-based miss behavior
    if (segment === 50) {
      const innerBullOutcome = getInnerBullOutcome();
      if (innerBullOutcome) {
        const inside = Math.max(0, innerBullOutcome.miss_inside ?? 0);
        const outside = Math.max(0, innerBullOutcome.miss_outside ?? 0);
        const neighbor = Math.max(0, innerBullOutcome.neighbor_singledouble ?? 0);
        const other = Math.max(0, innerBullOutcome.other ?? 0);
        const total = inside + outside + neighbor + other;

        if (total > 0) {
          const roll = Math.random() * total;
          if (roll < inside) return 'S25' as Target;
          if (roll < inside + outside) return null;
          const randomSegment = Math.floor(Math.random() * 20) + 1;
          return `S${randomSegment}` as Target;
        }
      }

      // Skill-based chance to hit outer bull on miss
      // Skill 1: 15% chance to hit obull, Skill 18: 40% chance
      const obullChance = 0.15 + (skillFactor * 0.25);
      const missRoll = Math.random();
      
      if (missRoll < obullChance) {
        // Hit outer bull instead
        return 'S25' as Target;
      } else {
        // Random number 1-20
        const randomSegment = Math.floor(Math.random() * 20) + 1;
        return `S${randomSegment}` as Target;
      }
    }
    
    // When missing outer bull (25), fixed 5% chance to hit inner bull instead (all skill levels)"
    if (segment === 25) {
      // Fixed 5% chance to hit inner bull on miss (all skill levels)
      const missRoll = Math.random();
      if (missRoll < 0.05) {
        // Small chance to hit inner bull
        return 'S50' as Target;
      } else {
        // Random number 1-20
        const randomSegment = Math.floor(Math.random() * 20) + 1;
        return `S${randomSegment}` as Target;
      }
    }
  }
  
  if (segment === 20 && !isCheckoutSetup) {
    return sampleMissDestination(skillLevel) ?? ('S20' as Target);
  }

  // For double attempts (D1-D20), allow some misses outside the board (no score)
  if (!isBullTarget && intendedMult === 'D') {
    const doubleOutcome = getDoubleOutcomeForSegment(segment);
    if (doubleOutcome) {
      const outside = Math.max(0, doubleOutcome.miss_outside ?? 0);
      const same = Math.max(0, doubleOutcome.miss_inside ?? 0);
      const neighbor = Math.max(0, doubleOutcome.neighbor_singledouble ?? 0);
      const other = Math.max(0, doubleOutcome.other ?? 0);
      const total = outside + same + neighbor + other;

      if (total > 0) {
        const roll = Math.random() * total;
        if (roll < outside) return null;
        if (roll < outside + same) return `S${segment}` as Target;
        if (roll < outside + same + neighbor) {
          return Math.random() < 0.5
            ? (`S${getPrevSegment(segment)}` as Target)
            : (`S${getNextSegment(segment)}` as Target);
        }
        const randomSegment = Math.floor(Math.random() * 20) + 1;
        return `S${randomSegment}` as Target;
      }
    }

    // Interpolate across level 1 to 18, anchored at:
    // Level 4: 60/30/5/5 and Level 18: 65/33/1/1
    const clampedLevel = Math.max(1, Math.min(18, skillLevel));
    const t = (clampedLevel - 1) / 17; // 0 at L1, 1 at L18
    const outside = 0.5892857143 + (0.0607142857 * t);
    const same = 0.2935714286 + (0.0364285714 * t);
    const prev = 0.0585714286 + (-0.0485714286 * t);
    const next = 0.0585714286 + (-0.0485714286 * t);

    const roll = Math.random();
    if (roll < outside) return null;
    if (roll < outside + same) return `S${segment}` as Target;
    if (roll < outside + same + prev) return `S${getPrevSegment(segment)}` as Target;
    return `S${getNextSegment(segment)}` as Target;
  }

  // For low-level triple attempts in checkout routes (e.g., T18/T17 setups),
  // make neighboring singles more likely than same-segment single.
  if (!isBullTarget && intendedMult === 'T' && skillLevel <= 4) {
    const lowLevelTripleMissProfile: Record<number, { same: number; prev: number; next: number }> = {
      1: { same: 0.42, prev: 0.29, next: 0.29 },
      2: { same: 0.46, prev: 0.27, next: 0.27 },
      3: { same: 0.50, prev: 0.25, next: 0.25 },
      4: { same: 0.54, prev: 0.23, next: 0.23 },
    };

    const profile = lowLevelTripleMissProfile[skillLevel] ?? lowLevelTripleMissProfile[4];
    const roll = Math.random();
    if (roll < profile.same) return `S${segment}` as Target;
    if (roll < profile.same + profile.prev) return `S${getPrevSegment(segment)}` as Target;
    return `S${getNextSegment(segment)}` as Target;
  }

  // For checkout setups or non-20 segments, always hit a valid segment (no bounceouts)
  // Level 4: 60/20/20, Level 18: 98/1/1
  const skillFactor = (skillLevel - 1) / 17; // 0 to 1
  const same = 0.60 + (0.38 * skillFactor);
  const prev = 0.20 + (-0.19 * skillFactor);
  const next = 0.20 + (-0.19 * skillFactor);

  const roll = Math.random();
  if (roll < same) return `S${segment}` as Target;
  if (roll < same + prev) return `S${getPrevSegment(segment)}` as Target;
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
  markerBonus?: number; // Bonus applied from following a marker
}

/**
 * Calculate marker bonus for following your dart
 * Returns a multiplier (e.g., 1.0 = no bonus, 1.3 = 30% increase)
 * 
 * Two scenarios:
 * 1. Aiming at double, previous missed completely off board (0 points) → bonus for having a visual marker
 * 2. Aiming at T20, previous hit T20 → bonus for grouping/clustering effect
 */
function calculateMarkerBonus(
  intended: Target,
  previousDart: BotDartThrow | null,
  skillLevel: number
): number {
  if (!previousDart) return 1.0; // First dart, no bonus
  
  const intendedMult = intended[0];
  const intendedSegment = parseInt(intended.slice(1), 10);
  
  // Scenario 1: Aiming at double, previous missed completely off board (0 points)
  // Visual marker to aim at - real darts phenomenon
  if (intendedMult === 'D' && previousDart.intended[0] === 'D') {
    // Check if previous dart missed the board completely (actual === null, score = 0)
    // This gives a visual marker (the dart sticking in the wall/floor) to aim from
    if (previousDart.actual === null && previousDart.score === 0) {
      // Skill-based bonus: L4: +15%, L10: +25%, L18: +40%
      const skillFactor = (skillLevel - 1) / 17; // 0 to 1
      const bonusMultiplier = 1.15 + (skillFactor * 0.25);
      return bonusMultiplier;
    }
  }
  
  // Scenario 2: Aiming at T20, previous hit T20 → clustering/grouping effect
  // Confidence boost and muscle memory from successful hit
  if (intended === 'T20' && previousDart.intended === 'T20') {
    // Check if previous actually hit T20
    if (previousDart.actual === 'T20' && previousDart.actualHit) {
      // Skill-based bonus: L4: +10%, L10: +18%, L18: +30%
      const skillFactor = (skillLevel - 1) / 17; // 0 to 1
      const bonusMultiplier = 1.10 + (skillFactor * 0.20);
      return bonusMultiplier;
    }
  }
  
  return 1.0; // No bonus
}

/**
 * Simulate a single dart throw at a target
 * Supports "following the marker" bonus from previous dart
 */
function simulateSingleDart(
  skillLevel: number,
  intended: Target,
  overrideHitChance?: number,
  isCheckoutSetup: boolean = false,
  previousDart: BotDartThrow | null = null
): BotDartThrow {
  const resolvedHitProb = typeof overrideHitChance === 'number'
    ? Math.max(0.0, Math.min(1.0, overrideHitChance))
    : getTargetHitProbability(skillLevel, intended);
  
  // Apply marker bonus from following previous dart
  const markerMultiplier = calculateMarkerBonus(intended, previousDart, skillLevel);
  const hitProb = Math.min(0.98, resolvedHitProb * markerMultiplier);
  const markerBonus = markerMultiplier > 1.0 ? (markerMultiplier - 1.0) : 0;
  
  const didHit = Math.random() < hitProb;

  if (didHit) {
    return {
      intended,
      actual: intended,
      score: calculateScore(intended),
      hitProbability: hitProb,
      actualHit: true,
      markerBonus,
    };
  }

  // Miss - use empirical distribution for segment 20, otherwise neighbors
  const segmentMatch = intended.match(/^([SDT])(\d+)$/);
  const segment = segmentMatch ? parseInt(segmentMatch[2], 10) : 20;
  const intendedMult = segmentMatch ? (segmentMatch[1] as 'S' | 'D' | 'T') : 'S';
  const isBullTarget = segment === 50 || segment === 25; // S50 = inner bull, S25 = outer bull
  const missTarget = sampleMissDestinationForSegment(segment, isBullTarget, isCheckoutSetup, skillLevel, intendedMult);
  const missScore = calculateScore(missTarget);

  return {
    intended,
    actual: missTarget,
    score: missScore,
    hitProbability: hitProb,
    actualHit: false,
    markerBonus,
  };
}

/**
 * Exported single-dart simulation for a specific intended target
 * Supports "following the marker" bonus from previous dart in the turn
 */
export function simulateDartAtTarget(
  skillLevel: number,
  intended: Target,
  overrideHitChance?: number,
  isCheckoutSetup: boolean = false,
  previousDart: BotDartThrow | null = null
): BotDartThrow {
  return simulateSingleDart(skillLevel, intended, overrideHitChance, isCheckoutSetup, previousDart);
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
    const previousDart = i > 0 ? darts[i - 1] : null;
    const dart = simulateSingleDart(skillLevel, intendedTarget, undefined, false, previousDart);
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
    const previousDart = i > 0 ? darts[i - 1] : null;
    const dart = simulateSingleDart(skillLevel, intended, undefined, false, previousDart);
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
 * Aligned with simulation_results.json bins
 */
export function getAverageRangeForLevel(level: number): string {
  const levelAverages: Record<number, string> = {
    1: '20-29',
    2: '20-29',
    3: '30-39',
    4: '30-39',
    5: '40-49',
    6: '40-49',
    7: '50-59',
    8: '50-59',
    9: '60-69',
    10: '60-69',
    11: '70-79',
    12: '70-79',
    13: '80-89',
    14: '80-89',
    15: '90-99',
    16: '90-99',
    17: '100-109',
    18: '110+',
  };
  return levelAverages[level] ?? '60-69';
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
