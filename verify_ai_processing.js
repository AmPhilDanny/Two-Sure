const { ProcessorAgent } = require('./src/lib/agents/processor');
const { configService } = require('./src/lib/services/config');

async function runVerification() {
  console.log('--- Verification Started ---');
  
  const config = await configService.getConfig();
  const aiConfig = {
    provider: config.aiProviders.gemini.enabled ? 'gemini' : 'openrouter',
    apiKey: config.aiProviders.gemini.enabled ? config.aiProviders.gemini.apiKey : config.aiProviders.openrouter.apiKey,
    model: config.aiProviders.gemini.enabled ? config.aiProviders.gemini.model : config.aiProviders.openrouter.model,
    systemPrompt: config.agentPrompts.processor
  };

  if (!aiConfig.apiKey) {
    console.error('No AI API key found in config. Please set it in .env or via Admin panel.');
    return;
  }

  const processor = new ProcessorAgent(aiConfig);
  console.log('Running processRawData with AI enhancement...');
  const count = await processor.processRawData();
  console.log(`Processed ${count} matches.`);

  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  const latest = await prisma.processedData.findFirst({
    where: { homeTeam: 'Enriched Intelligence' },
    orderBy: { createdAt: 'desc' }
  });

  if (latest) {
    console.log('Latest ProcessedData Summary:', latest.summary);
    const eliteMatches = (latest.structuredData || []).filter(m => m.confidenceTier === 'ELITE');
    const highMatches = (latest.structuredData || []).filter(m => m.confidenceTier === 'HIGH');
    console.log(`ELITE: ${eliteMatches.length} | HIGH: ${highMatches.length}`);
    
    if (eliteMatches.length > 0) {
      console.log('Sample ELITE match:', eliteMatches[0].homeTeam, 'vs', eliteMatches[0].awayTeam);
      console.log('AI Reasoning:', eliteMatches[0].summary);
    }
  }

  await prisma.$disconnect();
  console.log('--- Verification Finished ---');
}

runVerification().catch(console.error);
