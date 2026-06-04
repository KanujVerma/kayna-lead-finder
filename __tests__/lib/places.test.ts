import { parsePlacesResponse } from '@/lib/places'

const mockApiResponse = {
  places: [
    {
      id: 'ChIJ_abc123',
      displayName: { text: 'Test Restaurant' },
      primaryTypeDisplayName: { text: 'Restaurant' },
      nationalPhoneNumber: '+1 555-123-4567',
      websiteUri: 'https://testrestaurant.com',
      rating: 4.2,
      userRatingCount: 87,
    },
    {
      id: 'ChIJ_xyz789',
      displayName: { text: 'No Website Cafe' },
      primaryTypeDisplayName: { text: 'Cafe' },
      nationalPhoneNumber: '+1 555-987-6543',
      rating: 3.8,
      userRatingCount: 23,
    },
  ],
}

test('maps fields correctly for business with website', () => {
  const results = parsePlacesResponse(mockApiResponse, 'Seattle')
  expect(results[0]).toMatchObject({
    id: 'ChIJ_abc123',
    name: 'Test Restaurant',
    category: 'Restaurant',
    city: 'Seattle',
    phone: '+1 555-123-4567',
    website: 'https://testrestaurant.com',
    rating: 4.2,
    reviewCount: 87,
    score: 'loading',
  })
})

test('sets website to null and score to null for business without website', () => {
  const results = parsePlacesResponse(mockApiResponse, 'Seattle')
  expect(results[1].website).toBeNull()
  expect(results[1].score).toBeNull()
})

test('returns empty array for empty response', () => {
  expect(parsePlacesResponse({ places: [] }, 'Seattle')).toHaveLength(0)
  expect(parsePlacesResponse({}, 'Seattle')).toHaveLength(0)
})
