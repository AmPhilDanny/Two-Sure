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
   * Generate low-risk 2× accumulator betting slips.
   *
   * Rules (enforced strictly):
   * - Target is always ~2× odds.
   * - Each ticket has a MAXIMUM of 3 games.
   * - Tickets can also be single-game (1 very confident pick).
   * - NO match appears on more than one ticket — each game is unique globally.
   * - Minimum AI confidence: 80% per pick.
   * - Maximum odds per game: 1.65 (keeps it in the "safe" zone).
   * - If chat context is present, its suggested markets are prioritized first.
   *
   * @param matches     - Scraped match data from the DB
   * @param targetOdds  - Ignored; always builds 2× slips internally
   * @param chatContext - Optional: recent chat conversation context to guide selection
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
