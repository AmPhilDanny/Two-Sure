import { FootballApiService, NormalizedFixture } from "./football-api.interface";

export class TheSportsDBService implements FootballApiService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = `https://www.thesportsdb.com/api/v1/json/${apiKey}`;
  }

  private async fetchFromAPI(endpoint: string) {
    try {
      const response = await fetch(`${this.baseUrl}/${endpoint}`);
      if (!response.ok) {
        console.warn(`TheSportsDB error: ${response.statusText}`);
        return {};
      }
      return response.json();
    } catch (e: any) {
      console.warn(`TheSportsDB connection failed: ${e.message}`);
      return {};
    }
  }

  async getTodayFixtures(): Promise<NormalizedFixture[]> {
    const today = new Date().toISOString().split('T')[0];
    const data = await this.fetchFromAPI(`eventsday.php?d=${today}`);
    
    return (data.events || []).map((e: any) => ({
      homeTeam: e.strHomeTeam || e.strEvent?.split(' vs ')[0],
      awayTeam: e.strAwayTeam || e.strEvent?.split(' vs ')[1],
      league: e.strLeague,
      date: e.strTimestamp || `${e.dateEvent}T${e.strTime}`,
      externalId: e.idEvent
    }));
  }

  async testConnection(): Promise<boolean> {
    try {
      // Small lookup to test key
      const data = await this.fetchFromAPI('all_sports.php');
      return !!data.sports;
    } catch (e) {
      return false;
    }
  }
}
