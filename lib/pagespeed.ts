export function extractScore(data: Record<string, unknown>): number | null {
  try {
    const lr = data.lighthouseResult as Record<string, unknown> | undefined
    const cats = lr?.categories as Record<string, unknown> | undefined
    const perf = cats?.performance as { score: number } | undefined
    if (perf?.score == null) return null
    return Math.round(perf.score * 100)
  } catch {
    return null
  }
}

export async function fetchPageSpeed(url: string): Promise<number | null> {
  const apiKey = process.env.PAGESPEED_API_KEY!
  const endpoint =
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed` +
    `?url=${encodeURIComponent(url)}&strategy=mobile&key=${apiKey}`

  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(25_000) })
    if (!res.ok) return null
    return extractScore(await res.json())
  } catch {
    return null
  }
}
