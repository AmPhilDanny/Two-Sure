import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const slips = await prisma.predictionSlip.findMany({
      where: { archived: false },
      orderBy: { createdAt: 'desc' }
    });

    // Group by sessionId
    const grouped: Record<string, any> = {};
    for (const slip of slips) {
      const sId = slip.sessionId || slip.id; // Fallback to id if old slip
      if (!grouped[sId]) {
        grouped[sId] = {
          id: sId,
          timestamp: slip.createdAt.toISOString(),
          provider: 'AI Engine', // Can be refined if provider is stored per slip
          slips: [],
          targets: []
        };
      }
      grouped[sId].slips.push(slip);
      if (!grouped[sId].targets.includes(slip.targetOdds)) {
        grouped[sId].targets.push(slip.targetOdds);
      }
    }

    // Convert to array and sort by timestamp desc
    const historyArray = Object.values(grouped).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return NextResponse.json({ success: true, history: historyArray });
  } catch (error: any) {
    console.error('Fetch history error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ success: false, error: 'Session ID required' }, { status: 400 });
    }

    // Archive all slips in this session
    await prisma.predictionSlip.updateMany({
      where: { 
        OR: [
          { sessionId: sessionId },
          { id: sessionId } // fallback for old un-sessioned slips
        ]
      },
      data: { archived: true }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete history error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status, matchIndex } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, error: 'ID and status required' }, { status: 400 });
    }

    if (matchIndex !== undefined) {
      // Update individual match status within the JSON array
      const slip = await prisma.predictionSlip.findUnique({ where: { id } });
      if (!slip) throw new Error('Slip not found');

      const matches = [...(slip.matches as any[])];
      if (matches[matchIndex]) {
        matches[matchIndex].status = status;
      }

      const updated = await prisma.predictionSlip.update({
        where: { id },
        data: { matches }
      });
      return NextResponse.json({ success: true, slip: updated });
    } else {
      // Update the entire slip status
      const updated = await prisma.predictionSlip.update({
        where: { id },
        data: { status }
      });
      return NextResponse.json({ success: true, slip: updated });
    }
  } catch (error: any) {
    console.error('Update slip error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
