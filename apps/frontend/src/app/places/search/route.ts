import { NextRequest, NextResponse } from 'next/server';
import { PlaceSearchQuerySchema } from '@/lib/places/place.schema';
import { photonClient } from '@/lib/places/PhotonClient';

export async function GET(request: NextRequest) {
  const input = PlaceSearchQuerySchema.safeParse({
    query: request.nextUrl.searchParams.get('query'),
    kind: request.nextUrl.searchParams.get('kind'),
  });
  if (!input.success) {
    return NextResponse.json(
      {
        code: 'INVALID_PLACE_QUERY',
        message: 'Enter at least two characters.',
        details: [],
      },
      { status: 400 },
    );
  }

  try {
    const items = await photonClient.search(input.data.query, input.data.kind);
    return NextResponse.json(
      { items },
      { headers: { 'cache-control': 'private, max-age=60' } },
    );
  } catch {
    return NextResponse.json(
      {
        code: 'PLACE_SERVICE_UNAVAILABLE',
        message: 'Place suggestions are temporarily unavailable.',
        details: [],
      },
      { status: 503 },
    );
  }
}
