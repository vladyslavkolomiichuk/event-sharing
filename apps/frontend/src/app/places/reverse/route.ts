import { NextRequest, NextResponse } from 'next/server';
import { PlaceReverseQuerySchema } from '@/lib/places/place.schema';
import { photonClient } from '@/lib/places/PhotonClient';

export async function POST(request: NextRequest) {
  const input = PlaceReverseQuerySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success)
    return NextResponse.json(
      { message: 'Invalid coordinates.' },
      { status: 400 },
    );
  try {
    const place = await photonClient.reverse(
      input.data.latitude,
      input.data.longitude,
    );
    return NextResponse.json(
      { place },
      { headers: { 'cache-control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { message: 'Address lookup is unavailable.' },
      { status: 503 },
    );
  }
}
