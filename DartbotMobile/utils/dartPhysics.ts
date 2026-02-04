/**
 * Dart Physics & Probability Engine
 * 
 * Simulates realistic dart throws with:
 * - Skill-based accuracy
 * - Target proximity modeling
 * - Actual segment/multiplier hits
 * - Score calculation based on actual throws
 */

// ============================================================================
// DART BOARD DEFINITIONS
// ============================================================================

/** Standard dartboard segment order (clockwise from top) */
export const DARTBOARD_SEGMENTS = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5
] as const;

/** Multiplier types */
export type Multiplier = 'S' | 'D' | 'T'; // Single, Double, Triple
export type Target = `${Multiplier}${number}`; // e.g., "D20", "T15", "S1"

/**
 * Represents a dart throw result
 */
export interface DartThrow {
  /** What the player tried to hit */
  intended: Target;
  
  /** What was actually hit */
  actual: Target;
  
  /** Score from this dart (0 if bull) */
  score: number;
  
  /** Whether the dart hit the intended target */
  hit: boolean;
  
  /** Accuracy percentage (0-100) */
  accuracy: number;
  
  /** Distance from intended target in segments (0 = bull's eye) */
  distance: number;
}

/**
 * Dart throwing configuration
 */
export interface ThrowConfig {
  /** Skill level 1-18 (higher = better) */
  skillLevel: number;
  
  /** Optional override for hit probability (0-1) */
  overrideHitChance?: number;
  
  /** Whether to use actual proximity-based misses */
  useProximityModel: boolean;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parse a target string into multiplier and segment
 * e.g., "D20" → { multiplier: "D", segment: 20 }
 */
export function parseTarget(target: Target): { multiplier: Multiplier; segment: number } {
  const match = target.match(/^([SDT])(\d+)$/);
  if (!match) throw new Error(`Invalid target: ${target}`);
  return {
    multiplier: match[1] as Multiplier,
    segment: parseInt(match[2], 10),
  };
}

/**
 * Create a target string from multiplier and segment
 * e.g., { multiplier: "D", segment: 20 } → "D20"
 */
export function createTarget(multiplier: Multiplier, segment: number): Target {
  return `${multiplier}${segment}` as Target;
}

/**
 * Get score for a given target
 * S1=1, D1=2, T1=3, S20=20, D20=40, T20=60
 */
export function getTargetScore(target: Target): number {
  const { multiplier, segment } = parseTarget(target);
  const multipliers = { S: 1, D: 2, T: 3 };
  return segment * multipliers[multiplier];
}

/**
 * Get next segment clockwise
 */
export function getNextSegment(segment: number): number {
  const index = DARTBOARD_SEGMENTS.indexOf(segment as typeof DARTBOARD_SEGMENTS[number]);
  if (index === -1) throw new Error(`Invalid segment: ${segment}`);
  return DARTBOARD_SEGMENTS[(index + 1) % DARTBOARD_SEGMENTS.length];
}

/**
 * Get previous segment counter-clockwise
 */
export function getPrevSegment(segment: number): number {
  const index = DARTBOARD_SEGMENTS.indexOf(segment as typeof DARTBOARD_SEGMENTS[number]);
  if (index === -1) throw new Error(`Invalid segment: ${segment}`);
  return DARTBOARD_SEGMENTS[(index - 1 + DARTBOARD_SEGMENTS.length) % DARTBOARD_SEGMENTS.length];
}

/**
 * Distance between two segments on the dartboard (0-10)
 */
export function getSegmentDistance(from: number, to: number): number {
  if (from === to) return 0;
  const fromIndex = DARTBOARD_SEGMENTS.indexOf(from as typeof DARTBOARD_SEGMENTS[number]);
  const toIndex = DARTBOARD_SEGMENTS.indexOf(to as typeof DARTBOARD_SEGMENTS[number]);
  if (fromIndex === -1 || toIndex === -1) return 10;
  
  const direct = Math.abs(toIndex - fromIndex);
  const wrap = DARTBOARD_SEGMENTS.length - direct;
  return Math.min(direct, wrap);
}

// ============================================================================
// PROBABILITY CALCULATIONS
// ============================================================================

/**
 * Calculate hit probability based on skill level
 * 
 * Skill 1-5: 20-40% hit chance
 * Skill 6-10: 40-70% hit chance
 * Skill 11-15: 70-85% hit chance
 * Skill 16-18: 85-95% hit chance
 */
export function getHitProbability(skillLevel: number, targetDifficulty: number = 1): number {
  // Base probability from skill level
  const baseProbability = 0.1 + (skillLevel / 18) * 0.85; // 0.1 to 0.95
  
  // Adjust for target difficulty
  // Difficulty: 1.0 = easy (single), 1.3 = medium (double/triple), 1.5 = hard (outer ring)
  const adjustedProbability = baseProbability / targetDifficulty;
  
  // Clamp between 0 and 1
  return Math.max(0, Math.min(1, adjustedProbability));
}

/**
 * Get target difficulty modifier
 * Single areas are easier to hit than doubles/triples
 */
export function getTargetDifficulty(target: Target): number {
  const { multiplier } = parseTarget(target);
  
  // Difficulty increases with narrower target area
  switch (multiplier) {
    case 'S': return 1.0; // Single is base difficulty
    case 'D': return 1.3; // Double ring is narrower
    case 'T': return 1.3; // Triple ring is narrower
    default: return 1.0;
  }
}

/**
 * Calculate accuracy variance (standard deviation) based on skill level
 * Higher skill = more consistent
 * Lower skill = more random
 */
export function getAccuracyVariance(skillLevel: number): number {
  // Skill 1 = variance of 3.0 (very inconsistent)
  // Skill 18 = variance of 0.5 (very consistent)
  return 4 - (skillLevel / 18) * 3.5;
}

// ============================================================================
// THROW SIMULATION
// ============================================================================

/**
 * Simulate a single dart throw
 * Returns what the dart actually hit
 */
export function simulateDartThrow(
  intended: Target,
  config: ThrowConfig
): DartThrow {
  const { skillLevel, overrideHitChance, useProximityModel } = config;
  
  // Parse intended target
  const { multiplier: intendedMult, segment: intendedSeg } = parseTarget(intended);
  
  // Calculate hit probability
  const difficulty = getTargetDifficulty(intended);
  let hitChance = overrideHitChance ?? getHitProbability(skillLevel, difficulty);
  
  // Did the dart hit the intended target?
  const didHit = Math.random() < hitChance;
  
  if (didHit) {
    // Hit the intended target
    return {
      intended,
      actual: intended,
      score: getTargetScore(intended),
      hit: true,
      accuracy: 100,
      distance: 0,
    };
  }
  
  // Miss - determine what was actually hit
  if (!useProximityModel) {
    // Random miss on the board
    const randomSeg = DARTBOARD_SEGMENTS[Math.floor(Math.random() * DARTBOARD_SEGMENTS.length)];
    const randomMult: Multiplier[] = ['S', 'D', 'T'];
    const randomMultiplier = randomMult[Math.floor(Math.random() * randomMult.length)];
    const actual = createTarget(randomMultiplier, randomSeg);
    
    return {
      intended,
      actual,
      score: getTargetScore(actual),
      hit: false,
      accuracy: 0,
      distance: 20, // Random miss
    };
  }
  
  // Proximity-based miss - hit nearby segment
  const missDistance = getRandomMissDistance(skillLevel);
  
  // Determine direction of miss (left or right)
  const direction = Math.random() < 0.5 ? 1 : -1;
  let actualSeg = intendedSeg;
  
  for (let i = 0; i < Math.abs(missDistance); i++) {
    actualSeg = direction > 0 ? getNextSegment(actualSeg) : getPrevSegment(actualSeg);
  }
  
  // Determine if miss hit a single, double, or triple
  // Skill affects where the miss lands in the board
  const missType = getMissMultiplier(skillLevel, intendedMult);
  const actual = createTarget(missType, actualSeg);
  
  return {
    intended,
    actual,
    score: getTargetScore(actual),
    hit: false,
    accuracy: Math.max(0, 100 - (missDistance * 10)),
    distance: missDistance,
  };
}

/**
 * How many segments away does a miss land?
 * Skill 1 = 0-4 segments away
 * Skill 18 = 0-1 segments away
 */
function getRandomMissDistance(skillLevel: number): number {
  const maxDistance = Math.max(1, 5 - Math.floor(skillLevel / 4));
  return Math.floor(Math.random() * maxDistance);
}

/**
 * When missing, what multiplier gets hit?
 * Better players tend to miss to nearby areas on the board
 */
function getMissMultiplier(skillLevel: number, intendedMult: Multiplier): Multiplier {
  const random = Math.random();
  
  // High skill players tend to miss to the nearest single
  if (skillLevel >= 15) {
    return random < 0.7 ? 'S' : (random < 0.85 ? 'D' : 'T');
  }
  // Medium skill: more random
  if (skillLevel >= 10) {
    return random < 0.5 ? 'S' : (random < 0.75 ? 'D' : 'T');
  }
  // Low skill: very random
  return ['S', 'D', 'T'][Math.floor(random * 3)] as Multiplier;
}

// ============================================================================
// TURN SIMULATION (3 DARTS)
// ============================================================================

export interface TurnResult {
  darts: DartThrow[];
  totalScore: number;
  allHit: boolean;
  accuracy: number; // Average accuracy across all 3 darts
}

/**
 * Simulate a complete turn (up to 3 darts)
 * Can stop early if player busts
 */
export function simulateTurn(
  targets: [Target, Target, Target],
  config: ThrowConfig,
  currentScore: number
): TurnResult {
  const darts: DartThrow[] = [];
  let runningScore = 0;
  let busted = false;
  
  for (let i = 0; i < 3; i++) {
    const dart = simulateDartThrow(targets[i], config);
    darts.push(dart);
    
    const newScore = runningScore + dart.score;
    
    // Check for bust (score > remaining)
    if (newScore > currentScore) {
      busted = true;
      break; // Stop throwing
    }
    
    runningScore = newScore;
  }
  
  const accuracy =
    darts.reduce((sum, d) => sum + d.accuracy, 0) / darts.length;
  
  return {
    darts,
    totalScore: busted ? 0 : runningScore,
    allHit: darts.every(d => d.hit),
    accuracy,
  };
}

// ============================================================================
// CHECKOUT ANALYSIS
// ============================================================================

/**
 * Get probability of completing a checkout from a score
 * considering skill level and required multiplier
 */
export function getCheckoutProbability(
  score: number,
  skillLevel: number,
  dartsRemaining: number = 3
): number {
  if (score <= 0 || score > 170) return 0;
  
  // Simple model: better players have higher checkout %
  const baseProbability = (skillLevel / 18) * 0.9;
  
  // Modify based on darts remaining
  const dartsModifier = Math.pow(baseProbability, 3 / dartsRemaining);
  
  return Math.min(1, dartsModifier);
}

/**
 * Find optimal checkout segments for a score
 * Uses the checkout data if available
 */
export function findOptimalCheckout(score: number): Target[] | null {
  // Common checkouts that professional players use
  const commonCheckouts: { [key: number]: Target[] } = {
    50: ['D25', 'D25', 'D25'], // Double bull
    100: ['T20', 'D20'],
    101: ['T20', 'D20', 'S1'],
    110: ['T20', 'D25'],
    120: ['T20', 'D20', 'D20'],
    170: ['T20', 'T20', 'D25'],
    40: ['D20'],
    60: ['T20'],
    80: ['T20', 'D20'],
    // Add more as needed
  };
  
  if (commonCheckouts[score]) {
    return commonCheckouts[score];
  }
  
  return null;
}

// ============================================================================
// DIFFICULTY/PERFORMANCE ANALYSIS
// ============================================================================

/**
 * Estimate skill level from performance metrics
 */
export function estimateSkillLevel(
  hitRate: number, // 0-1, percentage of darts that hit intended target
  averageScore: number // Average score per dart (0-60)
): number {
  // Hit rate is primary indicator (0-1 maps to skill 1-18)
  const hitRateSkill = Math.max(1, Math.min(18, hitRate * 18));
  
  // Average score secondary indicator (avg 5 = skill 1, avg 35 = skill 18)
  const scoreSkill = Math.max(1, Math.min(18, (averageScore / 35) * 18));
  
  // Weight: hit rate 60%, average score 40%
  return hitRateSkill * 0.6 + scoreSkill * 0.4;
}

// ============================================================================
// REALISTIC THROW SEQUENCES
// ============================================================================

/**
 * Generate realistic target sequence for a turn
 * Based on dartboard strategy (e.g., high scores first)
 */
export function generateTargetSequence(
  score: number,
  skillLevel: number,
  attemptCheckout: boolean = false
): [Target, Target, Target] {
  // Default: aim for high-value areas
  let target1: Target = 'T20'; // 60 points
  let target2: Target = 'T20'; // Another 60
  let target3: Target = 'T20'; // And another
  
  if (attemptCheckout && score <= 170) {
    // Try to find checkout
    const checkout = findOptimalCheckout(score);
    if (checkout && checkout.length >= 1) {
      target1 = checkout[0];
      target2 = checkout.length > 1 ? checkout[1] : 'T20';
      target3 = checkout.length > 2 ? checkout[2] : 'T20';
    }
  } else if (score < 100) {
    // For lower scores, aim for singles
    target1 = 'S20';
    target2 = 'S20';
    target3 = 'S20';
  } else if (skillLevel >= 15) {
    // Skilled players go for triples
    target1 = 'T20';
    target2 = 'T20';
    target3 = 'T20';
  } else if (skillLevel >= 10) {
    // Medium skill: mix of triples and doubles
    target1 = 'T20';
    target2 = 'T20';
    target3 = 'D20';
  } else {
    // Low skill: safer areas
    target1 = 'D20';
    target2 = 'D20';
    target3 = 'D20';
  }
  
  return [target1, target2, target3];
}
