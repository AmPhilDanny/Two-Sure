import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const maxDuration = 60;

// ─── Flexible column name resolver ─────────────────────────────────────────
// Handles variations like "home_team", "HomeTeam", "home team", "Team 1", etc.
function resolve(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const found = Object.keys(row).find(k => k.toLowerCase().replace(/[\s_-]/g, '') === key.toLowerCase().replace(/[\s_-]/g, ''));
    if (found && row[found]?.trim()) return row[found].trim();
  }
  return '';
}

function resolveNum(row: Record<string, string>, ...keys: string[]): number | null {
  const val = resolve(row, ...keys);
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

// ─── CSV Parser ─────────────────────────────────────────────────────────────
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  return lines.slice(1).map(line => {
    // Handle quoted commas
    const values: string[] = [];
    let inQuote = false;
    let current = '';
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { values.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    values.push(current.trim());

    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  }).filter(row => resolve(row, 'hometeam', 'home', 'team1', 'homeside'));
}

// ─── POST /api/admin/ingest/bookmaker-csv ────────────────────────────────────
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json({ success: false, error: 'CSV has no valid match rows' }, { status: 400 });
    }

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const homeTeam = resolve(row, 'hometeam', 'home', 'team1', 'homeside', 'homename');
      const awayTeam = resolve(row, 'awayteam', 'away', 'team2', 'awayside', 'awayname');
      const league   = resolve(row, 'league', 'competition', 'division', 'tournament', 'comp');

      if (!homeTeam || !awayTeam) { skipped++; continue; }

      // Parse match date
      const rawDate = resolve(row, 'matchdate', 'date', 'kickoff', 'kickoffdate', 'datetime', 'matchtime');
      const matchDate = rawDate ? new Date(rawDate) : null;

      // Parse odds — support various naming conventions
      const homeOdds  = resolveNum(row, 'homeodds', 'home_odds', 'odd_h', 'odds_h', 'h_odds', '1', 'win', 'homewin');
      const drawOdds  = resolveNum(row, 'drawodds', 'draw_odds', 'odd_d', 'odds_d', 'd_odds', 'x', 'draw');
      const awayOdds  = resolveNum(row, 'awayodds', 'away_odds', 'odd_a', 'odds_a', 'a_odds', '2', 'awaywin');
      const bttsOdds  = resolveNum(row, 'btts', 'bttsodds', 'gg', 'goalgoal', 'bothteamsscore', 'bts');
      const over25    = resolveNum(row, 'over25', 'over2.5', 'o25', 'over_25', 'o2.5');
      const under25   = resolveNum(row, 'under25', 'under2.5', 'u25', 'under_25', 'u2.5');

      if (!homeOdds || !awayOdds) { skipped++; continue; }

      await prisma.scrapedData.create({
        data: {
          sourceApi:  'bookmaker_csv',
          matchId:    `csv_${homeTeam}_${awayTeam}_${Date.now()}`.replace(/\s+/g, '_').toLowerCase(),
          homeTeam,
          awayTeam,
          league:     league || 'Unknown League',
          matchDate:  matchDate && !isNaN(matchDate.getTime()) ? matchDate : null,
          odds: {
            home:    homeOdds,
            draw:    drawOdds,
            away:    awayOdds,
            btts:    bttsOdds,
            over25,
            under25
          },
          rawStats: { source: 'bookmaker_csv', raw: row }
        }
      });
      imported++;
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      total: rows.length,
      message: `Imported ${imported} bookmaker records. ${skipped > 0 ? `${skipped} rows skipped (missing team names or odds).` : ''}`
    });

  } catch (error: any) {
    console.error('Bookmaker CSV Import Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
