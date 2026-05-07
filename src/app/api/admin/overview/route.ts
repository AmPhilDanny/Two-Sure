import { NextResponse } from 'next/server';
import { configService } from '@/lib/services/config';
import { HealthAgent } from '@/lib/agents/health';
import prisma from '@/lib/prisma';

/** GET /api/admin/overview — returns config + history + health in one request */
export async function GET() {
  try {
    const [config, history, health] = await Promise.all([
      configService.getConfig(),
      prisma.predictionSlip.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      new HealthAgent().checkSystemHealth(),
    ]);

    return NextResponse.json({ config, history, health });
  } catch (error: any) {
    console.error('Overview error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
