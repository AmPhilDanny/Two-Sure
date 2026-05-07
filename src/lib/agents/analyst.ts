import { AIFactory, AIConfig, PredictionResult } from "../ai/provider";
import { MatchData } from "./scraper";

export interface BetSlip {
  id: string;
  matches: PredictionResult[];
  totalOdds: number;
  confidence: number;
  targetOdds: number;
}

export class AnalystAgent {
  private aiFactory: AIFactory;

  constructor(config: AIConfig) {
    this.aiFactory = new AIFactory(config);
  }

  /**
   * Generate accumulator betting slips.
   *
   * Each slip targets a combined odds range (e.g. ~2×, ~5×, ~10×).
   * Slips are built by accumulating MULTIPLE low-risk matches — NOT
   * by hunting for a single match with high odds.
   *
   * @param matches     - Scraped match data from the DB
   * @param targetOdds  - Array of desired combined odds targets (e.g. [2, 5, 10])
   * @param chatContext - Optional: recent chat conversation context to guide selection
   */
  async generateSlips(
    matches: MatchData[],
    targetOdds: number[] = [2, 5, 10],
    chatContext?: string
  ): Promise<BetSlip[]> {
    console.log(`[AnalystAgent] Generating slips for targets: ${targetOdds.join(', ')}`);

    if (!matches.length) {
      console.warn('[AnalystAgent] No match data available');
      return targetOdds.map(t => ({
        id: `SLIP-${t}-${Date.now()}`,
        matches: [],
        totalOdds: 0,
        confidence: 0,
        targetOdds: t
      }));
    }

    // ── Step 1: Get AI predictions for ALL matches in a single batch call ─────
    // This avoids per-match API calls and is far more efficient and accurate.
    const allPredictions = await this.aiFactory.predictBatch(
      matches.slice(0, 40), // cap at 40 to avoid token limits
      chatContext
    );

    if (!allPredictions.length) {
      console.warn('[AnalystAgent] No predictions returned from AI batch');
      return targetOdds.map(t => ({
        id: `SLIP-${t}-${Date.now()}`,
        matches: [],
        totalOdds: 0,
        confidence: 0,
        targetOdds: t
      }));
    }

    // ── Step 2: Filter & sort by confidence (probability) ────────────────────
    // Only include predictions the AI is reasonably confident about
    const qualified = allPredictions
      .filter(p => p.probability >= 0.60 && p.odds >= 1.10)
      .sort((a, b) => b.probability - a.probability); // highest confidence first

    // ── Step 3: Build accumulators for each target ────────────────────────────
    const slips: BetSlip[] = [];

    for (const target of targetOdds) {
      const slip = this.buildAccumulator(qualified, target);
      slips.push(slip);
    }

    return slips;
  }

  /**
   * Build a single accumulator slip by greedily adding high-confidence
   * low-odds matches until we reach or exceed the target combined odds.
   *
   * Strategy per target range:
   * - ~2×  → prefer odds 1.20–1.60, very high probability (>0.75)
   * - ~5×  → allow odds up to 2.00, high probability (>0.65)
   * - ~10× → allow odds up to 2.50, moderate probability (>0.60)
   */
  private buildAccumulator(predictions: PredictionResult[], target: number): BetSlip {
    // Determine the preferred odds window for this target range
    let maxOddsPerMatch: number;
    let minProbability: number;

    if (target <= 3) {
      maxOddsPerMatch = 1.65;
      minProbability = 0.72;
    } else if (target <= 6) {
      maxOddsPerMatch = 2.10;
      minProbability = 0.65;
    } else {
      maxOddsPerMatch = 2.60;
      minProbability = 0.60;
    }

    // Filter to predictions that fit this tier
    const pool = predictions.filter(
      p => p.odds <= maxOddsPerMatch && p.probability >= minProbability
    );

    // If pool is empty, fall back to the full sorted list
    const candidates = pool.length >= 2 ? pool : predictions;

    const chosen: PredictionResult[] = [];
    let combinedOdds = 1.0;
    let combinedProbability = 1.0;
    const usedMatches = new Set<string>();

    // Greedy accumulation: keep adding matches until target is reached
    for (const pred of candidates) {
      if (combinedOdds >= target) break;
      if (usedMatches.has(pred.match)) continue; // no duplicate matches

      chosen.push(pred);
      combinedOdds *= pred.odds;
      combinedProbability *= pred.probability;
      usedMatches.add(pred.match);
    }

    // If we couldn't reach the target, still return what we have
    return {
      id: `SLIP-${target}-${Date.now()}`,
      matches: chosen,
      totalOdds: parseFloat(combinedOdds.toFixed(2)),
      confidence: Math.round(combinedProbability * 100),
      targetOdds: target
    };
  }
}
