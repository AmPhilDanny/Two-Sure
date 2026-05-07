import { NextResponse } from 'next/server';
import { configService } from '@/lib/services/config';

export async function GET() {
  const config = await configService.getConfig();
  return NextResponse.json(config);
}

export async function POST(request: Request) {
  try {
    const newConfig = await request.json();
    await configService.updateConfig(newConfig);
    // Return the freshly-read config from DB so the frontend can verify what was saved
    const saved = await configService.getConfig();
    return NextResponse.json({ success: true, config: saved });
  } catch (error: any) {
    console.error('Config save error:', error);
    return NextResponse.json({ success: false, error: error?.message || 'Failed to update config' }, { status: 500 });
  }
}
