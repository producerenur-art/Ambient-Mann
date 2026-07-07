// api/verify-session.js — bekreft en fullført Stripe Checkout (donasjon) og
// returner beløp/e-post til takke-meldingen på siden.
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Stripe ikke satt opp' });

  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'Mangler session_id' });

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    const paid = session.payment_status === 'paid' || session.status === 'complete';
    if (!paid) return res.status(402).json({ error: 'Betaling ikke fullført' });

    res.status(200).json({
      success: true,
      sessionId: session.id,
      product: session.metadata?.product || null,
      amountTotal: session.amount_total || null,
      customerEmail: session.customer_details?.email || null,
    });
  } catch (err) {
    console.error('Stripe verify error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
