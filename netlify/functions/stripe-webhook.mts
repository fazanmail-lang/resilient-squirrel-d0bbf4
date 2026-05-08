import type { Context } from '@netlify/functions'
import Stripe from 'stripe'
import { getStore } from '@netlify/blobs'

// This webhook receives `checkout.session.completed` events from Stripe and records
// a paid entitlement in Blobs keyed by the `client_reference_id` we pass through to
// Stripe Checkout (the sessionId minted by /api/analyze).
//
// Required environment variables:
//   STRIPE_SECRET_KEY      — used to construct the Stripe client (any sk_... key works)
//   STRIPE_WEBHOOK_SECRET  — the signing secret for this endpoint, copied from
//                            Stripe Dashboard → Developers → Webhooks → endpoint
//
// In Stripe, point the webhook at https://<your-site>/api/stripe-webhook and
// subscribe at minimum to `checkout.session.completed`.

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 })
  }

  const secretKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secretKey || !webhookSecret) {
    return Response.json(
      { error: 'Stripe is not configured. Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.' },
      { status: 500 },
    )
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return Response.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const rawBody = await req.text()

  const stripe = new Stripe(secretKey)

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret)
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'Invalid signature'
    return Response.json({ error: `Webhook signature verification failed: ${detail}` }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session
    const ref = session.client_reference_id?.trim() ?? ''
    const paymentStatus = session.payment_status

    // Format: `${sessionId}` (legacy/audit), `${sessionId}:interview`, `${sessionId}:career`, or `${sessionId}:executive`.
    const [sessionId, productSuffix] = ref.split(':')
    const product =
      productSuffix === 'interview' ? 'interview' : productSuffix === 'career' ? 'career' : productSuffix === 'executive' ? 'executive' : 'audit'
    const storeName =
      product === 'interview'
        ? 'paid-interview-sessions'
        : product === 'career'
          ? 'paid-career-sessions'
          : product === 'executive'
            ? 'paid-executive-sessions'
            : 'paid-sessions'

    if (sessionId && paymentStatus === 'paid') {
      try {
        const paid = getStore({ name: storeName, consistency: 'strong' })
        await paid.setJSON(sessionId, {
          product,
          stripeCheckoutId: session.id,
          paymentIntent: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
          amountTotal: session.amount_total,
          currency: session.currency,
          paidAt: Date.now(),
        })
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'Unknown error'
        return Response.json({ error: `Could not record entitlement: ${detail}` }, { status: 500 })
      }
    }
  }

  return Response.json({ received: true })
}

export const config = {
  path: '/api/stripe-webhook',
}
