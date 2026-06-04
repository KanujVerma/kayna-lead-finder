import { NextRequest, NextResponse } from 'next/server'
import { searchPlaces } from '@/lib/places'

export async function GET(request: NextRequest) {
  const category = request.nextUrl.searchParams.get('category') ?? ''
  const city = request.nextUrl.searchParams.get('city') ?? ''

  if (!category || !city) {
    return NextResponse.json(
      { error: 'category and city are required' },
      { status: 400 }
    )
  }

  try {
    const businesses = await searchPlaces(category, city)
    return NextResponse.json({ businesses })
  } catch (err) {
    console.error('[/api/search]', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
