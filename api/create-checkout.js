// api/create-checkout.js — engangs-DONASJON via Stripe Checkout.
// Booking er GRATIS (e-post) – dette gjelder KUN frivillige donasjoner.
// Beløpet bestemmes autoritativt server-side (klemt), klienten kan aldri
// overstyre det. Krever STRIPE_SECRET_KEY. Uten den: 503 (siden bruker Vipps).
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const MIN_ORE = 2000;      // 20 kr
const MAX_ORE = 1000000;   // 10 000 kr

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Kortbetaling er ikke satt opp (mangler STRIPE_SECRET_KEY).' });
  }

  const body = req.body || {};
  if (body.product !== 'donation') return res.status(400).json({ error: 'Ukjent produkt' });

  // Klienten sender ønsket beløp i kr; serveren klemmer det.
  const kr = parseInt(body.amountKr, 10);
  const ore = Math.max(MIN_ORE, Math.min(MAX_ORE, (isFinite(kr) ? kr : 0) * 100));

  const siteUrl = process.env.SITE_URL || `https://${req.headers.host}`;

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'nok',
          product_data: {
            name: 'Donasjon til Ambient Mann',
            description: 'Frivillig støtte. Tusen takk! 💜',
          },
          unit_amount: ore,
        },
        quantity: 1,
      }],
      mode: 'payment',
      submit_type: 'donate',
      success_url: `${siteUrl}/?payment_success={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/`,
      metadata: { product: 'donation' },
    });
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe donation checkout error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
