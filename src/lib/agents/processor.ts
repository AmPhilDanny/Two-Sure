import { AIFactory, AIConfig } from "../ai/provider";
import prisma from "../prisma";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EnrichedMatch {
  homeTeam:        string;
  awayTeam:        string;
  league:          string;
  matchDate:       string | null;
  bestOdds: {
    home:    number | null;
    draw:    number | null;
    away:    number | null;
    btts:    number | null;
    over25:  number | null;
    under25: number | null;
  };
  impliedProbs: {
    home:    number | null;  // 0-1
    draw:    number | null;
    away:    number | null;
    btts:    number | null;
    over25:  number | null;
  };
  valueScore:      number;           // positive = value bet
  confidenceTier:  'ELITE' | 'HIGH' | 'MEDIUM' | 'SKIP';
  bestMarket:      string;           // "Home Win", "GG", "Over 2.5", etc.
  sources:         string[];         // which APIs/CSVs contributed
  hasBookmakerData: boolean;         // true if a CSV bookmaker record was present
  summary?:         string;           // AI reasoning or manual summary
}

export interface ProcessorResult {
  count:    number;
  elite:    number;
  high:     number;
  medium:   number;
  skipped:  number;
  matches:  EnrichedMatch[];
  summary:  string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalise team/league names for deduplication matching */
function normalise(s: string): string {
  if (!s) return '';
  return s.toLowerCase()
    .replace(/\b(fc|afc|sc|united|utd|city|town|wanderers|athletic|rovers|real|st)\b/g, '') // Remove common suffixes
    .replace(/[^a-z0-9]/g, '') // Remove all non-alphanumeric
    .trim();
}

/** Check if two strings are "fuzzy" similar */
function isFuzzyMatch(s1: string, s2: string): boolean {
  const n1 = normalise(s1);
  const n2 = normalise(s2);
  if (!n1 || !n2) return false;
  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true;
  return false;
}

/** Implied probability from decimal odds (removes overround per selection) */
function impliedProb(odds: number | null | undefined): number | null {
  if (!odds || odds <= 1.0) return null;
  return parseFloat((1 / odds).toFixed(4));
}

/**
 * Pick the "best" (sharpest) odds across multiple records.
 * For markets where you WANT the odds (Home/Away/Draw),
 * the sharpest bookmaker line has the LOWEST odds (most confident).
 */
function bestOdd(values: (number | null | undefined)[]): number | null {
  const valid = values.filter(v => v !== null && v !== undefined && v > 1.0) as number[];
  if (!valid.length) return null;
  return Math.min(...valid); // lowest = sharpest bookmaker line
}

/** Assign confidence tier from implied probability */
function tier(prob: number | null): EnrichedMatch['confidenceTier'] {
  if (!prob) return 'SKIP';
  if (prob >= 0.75) return 'ELITE';
  if (prob >= 0.65) return 'HIGH';
  if (prob >= 0.55) return 'MEDIUM';
  return 'SKIP';
}

/** Find the strongest individual market for this match */
function bestMarketFor(imp: EnrichedMatch['impliedProbs']): string {
  const candidates: [string, number | null][] = [
    ['Home Win',  imp.home],
    ['Draw',      imp.draw],
    ['Away Win',  imp.away],
    ['GG (BTTS)', imp.btts],
    ['Over 2.5',  imp.over25],
  ];
  const valid = candidates.filter(([, p]) => p !== null) as [string, number][];
  if (!valid.length) return 'Unknown';
  valid.sort((a, b) => b[1] - a[1]);
  return valid[0][0];
}

// ─── Processor Agent ──────────────────────────────────────────────────────────

export class ProcessorAgent {
  private aiFactory: AIFactory | null = null;

  constructor(config?: AIConfig) {
    if (config) {
      this.aiFactory = new AIFactory(config);
    }
  }

  /**
   * Main enrichment pipeline:
   * 1. Load all today's ScrapedData (API + CSV bookmaker)
   * 2. Deduplicate by match key
   * 3. Merge odds from multiple sources
   * 4. Compute implied probabilities + value scores
   * 5. Tier-classify each match
   * 6. Save enriched intelligence to ProcessedData
   */
  async processRawData(days: number = 1): Promise<number> {
    console.log('[Processor] Starting enrichment pipeline...');

    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);
    dateLimit.setHours(0, 0, 0, 0);

    const rawData = await prisma.scrapedData.findMany({
      where: { createdAt: { gte: dateLimit } }
    });

    if (rawData.length === 0) {
      console.log('[Processor] No raw data found.');
      return 0;
    }

    console.log(`[Processor] Loaded ${rawData.length} raw records. Enriching...`);

    // ── Step 1: Group by match key (with Fuzzy Matching) ──────────────────────
    const groups: { key: string; matches: typeof rawData }[] = [];

    for (const record of rawData) {
      const home = record.homeTeam;
      const away = record.awayTeam;
      
      // Try to find an existing group that matches fuzzy
      let foundGroup = groups.find(g => {
        const [gHome, gAway] = g.key.split('|');
        return isFuzzyMatch(home, gHome) && isFuzzyMatch(away, gAway);
      });

      if (foundGroup) {
        foundGroup.matches.push(record);
      } else {
        groups.push({ key: `${home}|${away}|${record.league}`, matches: [record] });
      }
    }

    // ── Step 2: Enrich each match group ──────────────────────────────────────
    const enriched: EnrichedMatch[] = [];

    for (const group of groups) {
      const records = group.matches;
      const first = records[0];
      const sources = [...new Set(records.map(r => r.sourceApi))];
      const hasBookmakerData = sources.includes('bookmaker_csv');

      // Collect all odds across sources
      const allOdds = records.map(r => r.odds as any);

      const bestOdds: EnrichedMatch['bestOdds'] = {
        home:    bestOdd(allOdds.map((o: any) => o?.home)),
        draw:    bestOdd(allOdds.map((o: any) => o?.draw)),
        away:    bestOdd(allOdds.map((o: any) => o?.away)),
        btts:    bestOdd(allOdds.map((o: any) => o?.btts)),
        over25:  bestOdd(allOdds.map((o: any) => o?.over25)),
        under25: bestOdd(allOdds.map((o: any) => o?.under25)),
      };

      const impliedProbs: EnrichedMatch['impliedProbs'] = {
        home:   impliedProb(bestOdds.home),
        draw:   impliedProb(bestOdds.draw),
        away:   impliedProb(bestOdds.away),
        btts:   impliedProb(bestOdds.btts),
        over25: impliedProb(bestOdds.over25),
      };

      // Value score: if bookmaker CSV is present, compare its home implied prob
      // vs the average API implied prob. Positive = CSV prices it higher (value).
      let valueScore = 0;
      if (hasBookmakerData) {
        const csvRecord    = records.find(r => r.sourceApi === 'bookmaker_csv');
        const apiRecords   = records.filter(r => r.sourceApi !== 'bookmaker_csv');
        const csvHomeProb  = impliedProb((csvRecord?.odds as any)?.home);
        const apiHomeProbs = apiRecords.map(r => impliedProb((r.odds as any)?.home)).filter(Boolean) as number[];
        const avgApiProb   = apiHomeProbs.length ? apiHomeProbs.reduce((a, b) => a + b, 0) / apiHomeProbs.length : null;

        if (csvHomeProb !== null && avgApiProb !== null && avgApiProb > 0) {
          valueScore = parseFloat(((csvHomeProb - avgApiProb) / avgApiProb).toFixed(4));
        }
      }

      // Best single market and confidence tier
      const bestMarketName = bestMarketFor(impliedProbs);
      const bestProb = Math.max(
        impliedProbs.home ?? 0,
        impliedProbs.away ?? 0,
        impliedProbs.btts ?? 0,
        impliedProbs.over25 ?? 0
      );
      const confidenceTier = tier(bestProb);

      const matchDate = records
        .map(r => r.matchDate)
        .find(d => d instanceof Date && !isNaN(d.getTime())) ?? null;

      enriched.push({
        homeTeam:         first.homeTeam,
        awayTeam:         first.awayTeam,
        league:           first.league,
        matchDate:        matchDate ? matchDate.toISOString() : null,
        bestOdds,
        impliedProbs,
        valueScore,
        confidenceTier,
        bestMarket:       bestMarketName,
        sources,
        hasBookmakerData,
      });
    }

    // ── Step 3: AI Intelligence Overlay ──────────────────────────────────────
    // If we have default/low confidence matches and AI is enabled, let the AI analyze them.
    if (this.aiFactory && enriched.length > 0) {
      const candidatesForAI = enriched.filter(m => 
        m.confidenceTier === 'SKIP' || 
        m.confidenceTier === 'MEDIUM' || 
        (m.bestOdds.home === 2.0 && m.bestOdds.draw === 3.0)
      ).slice(0, 40); // Limit to 40 matches per processing run to stay within AI limits

      if (candidatesForAI.length > 0) {
        console.log(`[Processor] Performing AI analysis on ${candidatesForAI.length} candidate matches...`);
        const aiResults = await this.aiFactory.predictBatch(candidatesForAI.map(m => ({
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          league: m.league,
          odds: m.bestOdds
        })));

        for (const aiRes of aiResults) {
          const match = enriched.find(m => `${m.homeTeam} vs ${m.awayTeam}` === aiRes.match);
          if (match && aiRes.probability >= 0.65) {
            // Upgrade confidence based on AI intelligence
            match.confidenceTier = aiRes.probability >= 0.75 ? 'ELITE' : 'HIGH';
            match.bestMarket = aiRes.prediction;
            // Also inject the AI reasoning into the summary for the analyst
            match.summary = `AI Analysis: ${aiRes.reasoning}`;
            // Adjust implied probs to reflect AI confidence
            (match.impliedProbs as any).aiScore = aiRes.probability;
          }
        }
      }
    }

    // ── Step 4: Sort by best probability desc ─────────────────────────────────
    enriched.sort((a, b) => {
      const aMax = Math.max(a.impliedProbs.home ?? 0, a.impliedProbs.away ?? 0, a.impliedProbs.btts ?? 0, a.impliedProbs.over25 ?? 0);
      const bMax = Math.max(b.impliedProbs.home ?? 0, b.impliedProbs.away ?? 0, b.impliedProbs.btts ?? 0, b.impliedProbs.over25 ?? 0);
      return bMax - aMax;
    });

    const elite  = enriched.filter(m => m.confidenceTier === 'ELITE').length;
    const high   = enriched.filter(m => m.confidenceTier === 'HIGH').length;
    const medium = enriched.filter(m => m.confidenceTier === 'MEDIUM').length;
    const skipped = enriched.filter(m => m.confidenceTier === 'SKIP').length;

    const summary = `[${new Date().toISOString()}] Enriched ${enriched.length} unique matches from ${rawData.length} raw records. ` +
      `ELITE: ${elite} | HIGH: ${high} | MEDIUM: ${medium} | SKIP: ${skipped}. ` +
      `Bookmaker CSV data: ${enriched.filter(m => m.hasBookmakerData).length} matches.`;

    console.log(`[Processor] ${summary}`);

    // ── Step 4: Save to ProcessedData ─────────────────────────────────────────
    await prisma.processedData.create({
      data: {
        matchDate:     new Date(),
        homeTeam:      'Enriched Intelligence',
        awayTeam:      `${enriched.length} Matches`,
        league:        `ELITE:${elite} HIGH:${high} MEDIUM:${medium}`,
        summary,
        structuredData: enriched as any
      }
    });

    return enriched.length;
  }

  /**
   * Returns the latest enriched ProcessedData for today, or null if not processed.
   */
  static async getLatestEnriched(): Promise<EnrichedMatch[] | null> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const latest = await prisma.processedData.findFirst({
      where: {
        createdAt: { gte: startOfToday },
        homeTeam: 'Enriched Intelligence'
      },
      orderBy: { createdAt: 'desc' }
    });

    if (!latest) return null;
    const data = latest.structuredData as any;
    if (!Array.isArray(data) || data.length === 0) return null;
    return data as EnrichedMatch[];
  }

  async cleanupOldData(days: number = 10): Promise<{ scraped: number; processed: number }> {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);

    const deletedScraped   = await prisma.scrapedData.deleteMany({ where: { createdAt: { lt: dateLimit } } });
    const deletedProcessed = await prisma.processedData.deleteMany({ where: { createdAt: { lt: dateLimit } } });

    return { scraped: deletedScraped.count, processed: deletedProcessed.count };
  }
}
