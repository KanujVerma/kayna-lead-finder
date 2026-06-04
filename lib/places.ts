import type { Business } from '@/types'

export function parsePlacesResponse(
  data: Record<string, unknown>,
  city: string
): Business[] {
  const places = (data.places as Record<string, unknown>[]) ?? []
  return places.map((place) => {
    const website = (place.websiteUri as string | undefined) ?? null
    return {
      id: place.id as string,
      name: (place.displayName as { text: string }).text,
      category:
        (place.primaryTypeDisplayName as { text: string } | undefined)?.text ?? '',
      city,
      phone: (place.nationalPhoneNumber as string | undefined) ?? '',
      website,
      rating: (place.rating as number | undefined) ?? null,
      reviewCount: (place.userRatingCount as number | undefined) ?? null,
      score: website ? 'loading' : null,
    }
  })
}

export async function searchPlaces(
  category: string,
  city: string
): Promise<Business[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY!

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': [
        'places.id',
        'places.displayName',
        'places.primaryTypeDisplayName',
        'places.nationalPhoneNumber',
        'places.websiteUri',
        'places.rating',
        'places.userRatingCount',
      ].join(','),
    },
    body: JSON.stringify({ textQuery: `${category} in ${city}`, pageSize: 20 }),
  })

  if (!res.ok) {
    throw new Error(`Places API error: ${res.status} ${res.statusText}`)
  }

  return parsePlacesResponse(await res.json(), city)
}
