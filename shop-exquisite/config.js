// ============================================================
//  SHOP EXQUISITE — store settings (edit this file)
// ============================================================
window.STORE = {
  name: "Shop Exquisite",
  // The owner's email: every order is delivered here.
  ownerEmail: "owner@example.com",          // <-- CHANGE ME to the owner's real email
  whatsapp: "18765339970",                  // 1 (876) 533-9970
  phoneDisplay: "1 (876) 533-9970",
  instagram: "shopexquisitewear",
  location: "Negril, Westmoreland",
  hours: "Open daily, 10:00 AM – 10:00 PM",
  // Card payments: card numbers are NEVER typed into this site or emailed.
  // Paste a hosted payment link from your card provider (e.g. Fygaro, WiPay,
  // Stripe Payment Link). Customers who choose "Pay by card" are sent there
  // after placing their order. Leave "" to send them a link by email/WhatsApp.
  cardPaymentLink: "",                       // <-- paste your payment link here
  currency: "JMD",
  currencySymbol: "J$",
  // DHL delivery island-wide
  shippingFlat: 1500,                        // flat DHL fee per order (adjust)
  freeShippingOver: 25000,                   // free delivery above this subtotal (0 = never)
  lowStockAt: 3                              // show "Only X left" at or below this
};
