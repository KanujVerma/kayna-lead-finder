import { NextRequest } from 'next/server'
import { fetchPageSpeed } from '@/lib/pagespeed'

// POST body: [{ id: string, url: string }]
// Streams SSE events: data: {"id":"...","score":73}\n\n
// Final event: event: done\ndata: {}\n\n
export async function POST(request: NextRequest) {
  const businesses: { id: string; url: string }[] = await request.json()
  const encoder = new TextEncoder()
  const BATCH_SIZE = 5

  const stream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < businesses.length; i += BATCH_SIZE) {
        const batch = businesses.slice(i, i + BATCH_SIZE)

        await Promise.all(
          batch.map(async ({ id, url }) => {
            const score = await fetchPageSpeed(url)
            const event = `data: ${JSON.stringify({ id, score })}\n\n`
            controller.enqueue(encoder.encode(event))
          })
        )
      }

      controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'))
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
