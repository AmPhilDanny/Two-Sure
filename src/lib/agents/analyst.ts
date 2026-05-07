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
   * Parse user intent from chat context (e.g., "Top 10 Over 1.5 goals")
   */
  private parseIntent(chatContext?: string): { market?: string; count?: number; isListRequested?: boolean } {
    if (!chatContext) return {};
    
    const lowerContext = chatContext.toLowerCase();
    const userIntentMatch = chatContext.match(/USER INTENT: (.*?)(\n\n|$)/s);
    const userIntentText = userIntentMatch ? userIntentMatch[1].toLowerCase() : null;
    
    // Market detection: Prioritize current user intent, then fallback to context
    let market: string | undefined;
    const marketText = userIntentText || lowerContext;

    if (marketText.includes('btts') || marketText.includes('gg') || marketText.includes('both teams')) market = 'GG (BTTS)';
    else if (marketText.includes('home win') || marketText.includes('direct win')) market = 'Home Win';
    else if (marketText.includes('away win')) market = 'Away Win';
    else if (marketText.includes('2.5') || marketText.includes('two point five')) market = 'Over 2.5';
    else if (marketText.includes('1.5') || marketText.includes('one point five')) market = 'Over 1.5';

    // List and Count detection MUST come from current USER INTENT only
    let count: number | undefined;
    let isListRequested = false;

    if (userIntentText) {
      isListRequested = userIntentText.includes('list') || userIntentText.includes('top') || userIntentText.includes('show') || userIntentText.includes('get');
      
      const countMatch = userIntentText.match(/\b(top|get|want|show|list|give me)\s*(\d{1,2})\b/) || userIntentText.match(/\b(\d{1,2})\s*(matches|games|picks)\b/);
      if (countMatch) {
        count = parseInt(countMatch[2] || countMatch[1]);
      } else if (userIntentText.includes('top 10') || userIntentText.includes('ten matches')) {
        count = 10;
      } else if (userIntentText.includes('top 5') || userIntentText.includes('five matches')) {
        count = 5;
      }
    }
    
    return { market, count, isListRequested };
  }

  /**
   * Generate precision slips from ENRICHED ProcessedData.
   */
  async generateSlipsFromEnriched(
    enriched: EnrichedMatch[],
    chatContext?: string
  ): Promise<BetSlip[]> {
    const intent = this.parseIntent(chatContext);
    console.log(`[AnalystAgent] Generating slips. Intent detected:`, intent);

    // Filter to ELITE + HIGH first, fallback to MEDIUM if intent-count is high
    const qualified = enriched.filter(m =>
      m.confidenceTier === 'ELITE' || 
      m.confidenceTier === 'HIGH' ||
      (intent.count && intent.count > 5 && m.confidenceTier === 'MEDIUM') // Expand pool for long slips
    );

    if (qualified.length === 0) {
      console.warn('[AnalystAgent] No qualified matches available.');
      return [];
    }

    // Convert enriched matches to PredictionResult format
    const predictions: PredictionResult[] = qualified.map(m => {
      // Pick markets based on intent or strongest
      const allCandidates = [
        ['Home Win',  m.impliedProbs.home,   m.bestOdds.home],
        ['Away Win',  m.impliedProbs.away,   m.bestOdds.away],
        ['GG (BTTS)', m.impliedProbs.btts,   m.bestOdds.btts],
        ['Over 1.5',  m.impliedProbs.over15, m.bestOdds.over15],
        ['Over 2.5',  m.impliedProbs.over25, m.bestOdds.over25],
      ].filter(([, p, o]) => p !== null && o !== null && Number(o) >= 1.05) as [string, number, number][];

      let selection: string;
      let probability: number;
      let odds: number;

      if (intent.market) {
        const found = allCandidates.find(([name]) => name.toLowerCase() === intent.market?.toLowerCase());
        if (found) {
          [selection, probability, odds] = found;
        } else {
          // Fallback if specific market missing for this match
          return null;
        }
      } else {
        allCandidates.sort((a, b) => b[1] - a[1]);
        if (!allCandidates.length) return null;
        [selection, probability, odds] = allCandidates[0];
      }

      return {
        match:       `${m.homeTeam} vs ${m.awayTeam}`,
        prediction:  selection,
        odds,
        probability,
        reasoning:   (m as any).summary?.startsWith('AI Analysis:') 
                       ? (m as any).summary 
                       : `Implied probability: ${(probability * 100).toFixed(1)}% | League: ${m.league} | Sources: ${m.sources.join(', ')}`,
        league:      m.league,
        homeTeam:    m.homeTeam,
        awayTeam:    m.awayTeam,
        status:      'PENDING',
        confidence:  Math.round(probability * 100),
        aiScore:     (m.impliedProbs as any).aiScore,
        aiReasoning: (m as any).summary?.startsWith('AI Analysis:') ? (m as any).summary : null
      };
    }).filter(Boolean) as PredictionResult[];

    let sorted = [...predictions].sort((a, b) => b.probability - a.probability);

    // If "Long Slip Mode" (e.g., Top 10) requested explicitly
    if (intent.isListRequested && intent.count && intent.count > 3) {
      console.log(`[AnalystAgent] Long Slip Mode: Building ticket with ${intent.count} matches.`);
      const matches = sorted.slice(0, intent.count);
      let combinedOdds = 1.0;
      let combinedProb = 1.0;
      matches.forEach(m => {
        combinedOdds *= m.odds;
        combinedProb *= (m as any).aiScore || m.probability;
      });

      return [{
        id: `LONG-SLIP-${Date.now()}`,
        matches,
        totalOdds: parseFloat(combinedOdds.toFixed(2)),
        confidence: Math.round(combinedProb * 100),
        targetOdds: 0 // No target for long slips
      }];
    }

    // Standard 3 unique tickets
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
   * Build a single 2× precision ticket.
   */
  private buildPrecisionTicket(candidates: PredictionResult[], ticketNum: number): BetSlip {
    const TARGET    = 2.0;
    const MAX_GAMES = 3;

    const chosen: PredictionResult[] = [];
    let combinedOdds = 1.0;
    let combinedProbability = 1.0;

    for (const pred of candidates) {
      if (chosen.length >= MAX_GAMES) break;
      if (combinedOdds >= TARGET) break;

      chosen.push(pred);
      combinedOdds        *= pred.odds;
      combinedProbability *= (pred as any).aiScore || pred.probability;
    }

    return {
      id:          `SLIP-${ticketNum}-${Date.now()}`,
      matches:     chosen,
      totalOdds:   parseFloat(combinedOdds.toFixed(2)),
      confidence:  Math.round(combinedProbability * 100),
      targetOdds:  2
    };
  }
  /**
   * Generate precision 2× slips from RAW ScrapedData (fallback).
   */
  async generateSlips(
    matches: MatchData[],
    targetOdds: number[] = [2],
    chatContext?: string
  ): Promise<BetSlip[]> {
    console.log(`[AnalystAgent] Generating fallback slips...`);
    const allPredictions = await this.aiFactory.predictBatch(matches.slice(0, 60), chatContext);
    const qualified = allPredictions
      .filter(p => p.probability >= 0.80 && p.odds >= 1.10 && p.odds <= 1.65)
      .sort((a, b) => b.probability - a.probability);

    const slips: BetSlip[] = [];
    const usedGlobally = new Set<string>();
    for (let ticketNum = 0; ticketNum < 3; ticketNum++) {
      const available = qualified.filter(p => !usedGlobally.has(p.match));
      if (available.length === 0) break;
      const slip = this.buildPrecisionTicket(available, ticketNum + 1);
      if (slip.matches.length === 0) break;
      slip.matches.forEach(m => usedGlobally.add(m.match));
      slips.push(slip);
    }
    return slips;
  }
}
