import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const data = await prisma.processedData.findMany({
      orderBy: {
        createdAt: 'desc'
      },
      take: 50
    });

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Fetch Processed Data Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
