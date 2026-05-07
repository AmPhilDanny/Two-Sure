import { AIFactory, AIConfig, PredictionResult } from "../ai/provider";
import { MatchData } from "./scraper";
import { EnrichedMatch } from "./processor";

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
   * Generate precision 2× slips from ENRICHED ProcessedData.
   * Uses pre-computed implied probabilities — much faster and more accurate.
   * Only ELITE and HIGH tier matches are considered.
   */
  async generateSlipsFromEnriched(
    enriched: EnrichedMatch[],
    chatContext?: string
  ): Promise<BetSlip[]> {
    console.log(`[AnalystAgent] Generating precision slips from ${enriched.length} enriched matches...`);

    // Filter to ELITE + HIGH only
    const qualified = enriched.filter(m =>
      m.confidenceTier === 'ELITE' || m.confidenceTier === 'HIGH'
    );

    if (qualified.length === 0) {
      console.warn('[AnalystAgent] No ELITE or HIGH tier matches available.');
      return [];
    }

    // Convert enriched matches to PredictionResult format
    const predictions: PredictionResult[] = qualified.map(m => {
      // Pick the strongest market
      const candidates: [string, number | null, number | null][] = [
        ['Home Win',  m.impliedProbs.home,   m.bestOdds.home],
        ['Away Win',  m.impliedProbs.away,   m.bestOdds.away],
        ['GG (BTTS)', m.impliedProbs.btts,   m.bestOdds.btts],
        ['Over 2.5',  m.impliedProbs.over25, m.bestOdds.over25],
      ].filter(([, p, o]) => p !== null && o !== null && Number(o) >= 1.10 && Number(o) <= 1.65) as [string, number, number][];

      if (!candidates.length) return null;
      candidates.sort((a, b) => b[1] - a[1]);
      const [selection, probability, odds] = candidates[0];

      return {
        match:       `${m.homeTeam} vs ${m.awayTeam}`,
        prediction:  selection,
        odds,
        probability,
        reasoning:   `Implied probability: ${(probability * 100).toFixed(1)}% | League: ${m.league} | Sources: ${m.sources.join(', ')}${m.hasBookmakerData ? ' | ✓ Bookmaker data' : ''}`,
        league:      m.league,
        homeTeam:    m.homeTeam,
        awayTeam:    m.awayTeam,
        status:      'PENDING',
        confidence:  Math.round(probability * 100)
      };
    }).filter(Boolean) as PredictionResult[];

    // Boost chat-context matches to front
    let sorted = [...predictions].sort((a, b) => b.probability - a.probability);
    if (chatContext && chatContext.trim().length > 20) {
      const keywords = chatContext.toLowerCase().match(/\b(\w{3,})\b/g) || [];
      sorted = [
        ...sorted.filter(p => keywords.some(kw => p.match.toLowerCase().includes(kw) || p.reasoning.toLowerCase().includes(kw))),
        ...sorted.filter(p => !keywords.some(kw => p.match.toLowerCase().includes(kw) || p.reasoning.toLowerCase().includes(kw)))
      ];
    }

    // Build up to 3 unique tickets
    const slips: BetSlip[] = [];
    const usedGlobally = new Set<string>();

    for (let ticketNum = 0; ticketNum < 3; ticketNum++) {
      const available = sorted.filter(p => !usedGlobally.has(p.match));
      if (available.length === 0) break;
      const slip = this.buildPrecisionTicket(available, ticketNum + 1);
      if (slip.matches.length === 0) break;
      slip.matches.forEach(m => usedGlobally.add(m.match));
      slips.push(slip);
    }

    return slips;
  }

  /**
   * Generate precision 2× slips from RAW ScrapedData (fallback when no ProcessedData available).
   */
  async generateSlips(
    matches: MatchData[],
    targetOdds: number[] = [2],
    chatContext?: string
  ): Promise<BetSlip[]> {
    console.log(`[AnalystAgent] Generating precision 2× slips...`);

    if (!matches.length) {
      console.warn('[AnalystAgent] No match data available');
      return [];
    }

    // ── Step 1: Get AI predictions for up to 60 matches in a single batch ────
    const allPredictions = await this.aiFactory.predictBatch(
      matches.slice(0, 60),
      chatContext
    );

    if (!allPredictions.length) {
      console.warn('[AnalystAgent] No predictions returned from AI batch');
      return [];
    }

    // ── Step 2: Strict quality filter ────────────────────────────────────
    // Only picks the AI rates at 80%+ probability and odds between 1.10 and 1.65
    let qualified = allPredictions
      .filter(p => p.probability >= 0.80 && p.odds >= 1.10 && p.odds <= 1.65)
      .sort((a, b) => b.probability - a.probability); // highest confidence first

    // ── Step 3: Boost chat-context matches to the front if present ──────────
    if (chatContext && chatContext.trim().length > 20) {
      // Extract keywords from the chat context (leagues, teams, market types)
      const keywords = chatContext.toLowerCase().match(/\b(\w{3,})\b/g) || [];
      qualified = [
        ...qualified.filter(p =>
          keywords.some(kw =>
            p.match.toLowerCase().includes(kw) ||
            p.reasoning.toLowerCase().includes(kw)
          )
        ),
        ...qualified.filter(p =>
          !keywords.some(kw =>
            p.match.toLowerCase().includes(kw) ||
            p.reasoning.toLowerCase().includes(kw)
          )
        )
      ];
    }

    // ── Step 4: Build up to 3 unique tickets, NO match reuse ──────────────
    const slips: BetSlip[] = [];
    const usedGlobally = new Set<string>(); // Ensures no match appears on > 1 ticket

    for (let ticketNum = 0; ticketNum < 3; ticketNum++) {
      const available = qualified.filter(p => !usedGlobally.has(p.match));
      if (available.length === 0) break;

      const slip = this.buildPrecisionTicket(available, ticketNum + 1);
      if (slip.matches.length === 0) break;

      // Mark all games in this slip as globally used
      slip.matches.forEach(m => usedGlobally.add(m.match));
      slips.push(slip);
    }

    return slips;
  }

  /**
   * Build a single 2× precision ticket.
   * - Tries to accumulate 2–3 games to approach 2× combined odds.
   * - Falls back to a single game if only one elite pick is available.
   * - Stops at 3 games maximum.
   */
  private buildPrecisionTicket(candidates: PredictionResult[], ticketNum: number): BetSlip {
    const TARGET    = 2.0;   // Aim for ~2× combined odds
    const MAX_GAMES = 3;     // Hard cap per ticket

    const chosen: PredictionResult[] = [];
    let combinedOdds = 1.0;
    let combinedProbability = 1.0;

    for (const pred of candidates) {
      if (chosen.length >= MAX_GAMES) break;
      if (combinedOdds >= TARGET) break;

      chosen.push(pred);
      combinedOdds        *= pred.odds;
      combinedProbability *= pred.probability;
    }

    return {
      id:          `SLIP-${ticketNum}-${Date.now()}`,
      matches:     chosen,
      totalOdds:   parseFloat(combinedOdds.toFixed(2)),
      confidence:  Math.round(combinedProbability * 100),
      targetOdds:  2
    };
  }
}
