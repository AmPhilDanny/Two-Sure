import { NextResponse } from 'next/server';
import { HealthAgent } from '@/lib/agents/health';

export async function GET() {
  const health = new HealthAgent();
  try {
    const status = await health.checkSystemHealth();
    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ 
      status: 'error', 
      message: error.message 
    }, { status: 500 });
  }
}
