const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkConfig() {
  const configs = await prisma.systemConfig.findMany();
  console.log('Total Configs:', configs.length);
  console.log('Configs:', JSON.stringify(configs, null, 2));
  await prisma.$disconnect();
}

checkConfig();
