import { FootballApiService, NormalizedFixture } from "./football-api.interface";

export class APIFootballService implements FootballApiService {
  private apiKey: string;
  private baseUrl: string = 'https://v3.football.api-sports.io';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetchFromAPI(endpoint: string, params: Record<string, string> = {}) {
    const url = new URL(`${this.baseUrl}/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'x-rapidapi-key': this.apiKey,
        'x-rapidapi-host': 'v3.football.api-sports.io'
      }
    });

    if (!response.ok) {
      throw new Error(`API-Football error: ${response.statusText}`);
    }

    return response.json();
  }

  async getTodayFixtures(daysAhead: number = 0): Promise<NormalizedFixture[]> {
    const today = new Date().toISOString().split('T')[0];
    
    console.log(`[API-Football] Fetching fixtures and odds for ${today}...`);
    
    // 1. Fetch fixtures
    const fixturesRes = await this.fetchFromAPI('fixtures', { date: today });
    const fixtures = fixturesRes.response || [];

    // 2. Fetch odds for today
    const oddsRes = await this.fetchFromAPI('odds', { date: today });
    const odds = oddsRes.response || [];

    // 3. Create an odds map for fast lookup
    const oddsMap = new Map();
    odds.forEach((o: any) => {
      const bookmaker = o.bookmakers?.[0] || {};
      const market1X2 = bookmaker.bets?.find((b: any) => b.name === 'Match Winner');
      if (market1X2) {
        oddsMap.set(o.fixture.id, {
          home: market1X2.values.find((v: any) => v.value === 'Home')?.odd,
          draw: market1X2.values.find((v: any) => v.value === 'Draw')?.odd,
          away: market1X2.values.find((v: any) => v.value === 'Away')?.odd,
        });
      }
    });

    return fixtures.map((f: any) => {
      const matchOdds = oddsMap.get(f.fixture.id);
      return {
        homeTeam: f.teams.home.name,
        awayTeam: f.teams.away.name,
        league: f.league.name,
        date: f.fixture.date,
        externalId: f.fixture.id.toString(),
        rawData: {
          ...f,
          odd_1: matchOdds?.home,
          odd_x: matchOdds?.draw,
          odd_2: matchOdds?.away
        }
      };
    });
  }

  async testConnection(): Promise<boolean> {
    try {
      const data = await this.fetchFromAPI('status');
      return !!data.response;
    } catch (e) {
      return false;
    }
  }
}
