import { FootballApiService, NormalizedFixture } from "./football-api.interface";

export class APIFootballDotComService implements FootballApiService {
  private apiKey: string;
  private baseUrl: string = 'https://apiv3.apifootball.com/';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetchFromAPI(action: string, params: Record<string, string> = {}) {
    const url = new URL(this.baseUrl);
    url.searchParams.append('action', action);
    url.searchParams.append('APIkey', this.apiKey);
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(`APIFootball.com error: ${response.statusText}`);
    }

    return response.json();
  }

  async getTodayFixtures(daysAhead: number = 0): Promise<NormalizedFixture[]> {
    const today = new Date();
    const future = new Date();
    future.setDate(today.getDate() + daysAhead);
    
    const from = today.toISOString().split('T')[0];
    const to = future.toISOString().split('T')[0];

    console.log(`[APIFootball.com] Fetching fixtures from ${from} to ${to}...`);
    const data = await this.fetchFromAPI('get_events', { from, to });
    
    if (!Array.isArray(data)) return [];

    return data.map((m: any) => ({
      homeTeam: m.match_hometeam_name,
      awayTeam: m.match_awayteam_name,
      league: m.league_name,
      date: `${m.match_date}T${m.match_time}`,
      externalId: m.match_id,
      rawData: m, // Save everything
      stats: {
        last5: { home: m.match_hometeam_system, away: m.match_awayteam_system },
        bttsOdds: parseFloat(m.prob_btts) || 0
      }
    }));
  }

  async testConnection(): Promise<boolean> {
    try {
      const data = await this.fetchFromAPI('get_countries');
      return Array.isArray(data);
    } catch (e) {
      return false;
    }
  }
}
