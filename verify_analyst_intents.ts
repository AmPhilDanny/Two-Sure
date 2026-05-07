import { AnalystAgent } from './src/lib/agents/analyst';
import { configService } from './src/lib/services/config';
import { PrismaClient } from '@prisma/client';

async function run() {
  const prisma = new PrismaClient();
  const latest = await prisma.processedData.findFirst({
    where: { homeTeam: 'Enriched Intelligence' },
    orderBy: { createdAt: 'desc' }
  });

  if (!latest) {
    console.error('No processed data found');
    await prisma.$disconnect();
    return;
  }

  const config = await configService.getConfig();
  const aiConfig = {
    provider: 'gemini' as const,
    apiKey: config.aiProviders.gemini.apiKey,
    model: config.aiProviders.gemini.model,
    systemPrompt: config.agentPrompts.analyst
  };

  const analyst = new AnalystAgent(aiConfig);

  console.log('--- Testing Standard Mode ---');
  const slipsStandard = await analyst.generateSlipsFromEnriched(latest.structuredData as any);
  console.log('Standard Slips Count:', slipsStandard.length);
  slipsStandard.forEach((s, i) => {
    console.log(`Slip ${i+1}: ${s.matches.length} matches, Odds: ${s.totalOdds}`);
  });

  console.log('\n--- Testing Intent Mode: "Top 10 Over 1.5" ---');
  const slipsIntent = await analyst.generateSlipsFromEnriched(
    latest.structuredData as any, 
    'lets have the top 10 matches that guarantes over 1.5 goals with low risk'
  );
  console.log('Intent Slips Count:', slipsIntent.length);
  if (slipsIntent[0]) {
    console.log(`Matches in Slip 1: ${slipsIntent[0].matches.length}`);
    console.log(`First Match: ${slipsIntent[0].matches[0].match}`);
    console.log(`Market: ${slipsIntent[0].matches[0].prediction}`);
  }

  await prisma.$disconnect();
}

run().catch(console.error);
