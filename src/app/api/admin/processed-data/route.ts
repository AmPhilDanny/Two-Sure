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

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'ID is required' }, { status: 400 });
    }

    await prisma.processedData.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete Processed Data Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
