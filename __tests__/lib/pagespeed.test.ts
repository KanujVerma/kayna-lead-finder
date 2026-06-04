import { extractScore } from '@/lib/pagespeed'

test('extracts mobile performance score and converts to 0-100', () => {
  const mockResponse = {
    lighthouseResult: {
      categories: {
        performance: { score: 0.73 },
      },
    },
  }
  expect(extractScore(mockResponse)).toBe(73)
})

test('rounds fractional scores', () => {
  const mockResponse = {
    lighthouseResult: { categories: { performance: { score: 0.556 } } },
  }
  expect(extractScore(mockResponse)).toBe(56)
})

test('returns null for missing or malformed data', () => {
  expect(extractScore({})).toBeNull()
  expect(extractScore({ lighthouseResult: {} })).toBeNull()
  expect(extractScore({ lighthouseResult: { categories: {} } })).toBeNull()
})
