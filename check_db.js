const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  const scrapedCount = await prisma.scrapedData.count();
  const processedCount = await prisma.processedData.count();
  const predictionCount = await prisma.predictionSlip.count();
  
  console.log('ScrapedData count:', scrapedCount);
  console.log('ProcessedData count:', processedCount);
  console.log('PredictionSlip count:', predictionCount);

  if (scrapedCount > 0) {
      const latestScraped = await prisma.scrapedData.findFirst({ orderBy: { createdAt: 'desc' } });
      console.log('Latest ScrapedData:', JSON.stringify(latestScraped, null, 2));
  }

  if (processedCount > 0) {
      const latestProcessed = await prisma.processedData.findFirst({ orderBy: { createdAt: 'desc' } });
      console.log('Latest ProcessedData:', JSON.stringify(latestProcessed, null, 2));
  }

  await prisma.$disconnect();
}

checkData();
