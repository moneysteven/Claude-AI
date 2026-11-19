// Glow by Launthia – card payments through NCB Jamaica / First Atlantic Commerce (FAC) hosted payment page.
//
// STATUS: AWAITING MERCHANT INTEGRATION. Nothing here talks to FAC yet, and nothing can be charged by card.
// The checkout shows "Card payments are being set up" and the card option cannot be chosen, even if it is
// switched on in the dashboard, until this adapter is completed and FAC_READY is set to true.
//
// No FAC addresses, field names, signatures or secret names have been guessed. To finish this adapter we need,
// from NCB / First Atlantic Commerce:
//   1. the merchant credentials for the test environment (and later for live), stored as Supabase secrets;
//   2. the official integration documentation for the hosted payment page: how to start a payment (where to
//      send the client and what to send), what comes back when the client returns, how a result is verified
//      server to server, and how notifications (if any) are authenticated;
//   3. the test card details and the test-environment addresses;
//   4. how refunds are made and reported.
// Card numbers are only ever typed on FAC's own page: they never reach this site, these functions or the database.
//
// When the documentation arrives, the three jobs below are written to it, tested in FAC's test environment,
// and the result is passed to the same database functions PayPal uses (record_payment_started,
// lock_for_capture where it applies, confirm_booking_payment, mark_payment_pending, fail_booking_payment).

export const FAC_READY = false;
export const FAC_STATUS = "awaiting merchant integration";

export function facReady(): boolean {
  return FAC_READY;
}

export interface FacStart {
  bookingId: string;
  amount: number;          // exact amount from the database (prepare_payment)
  currency: "JMD" | "USD";
  description: string;
  returnUrl: string;
}
export interface FacStartResult {
  redirectUrl: string;     // FAC's hosted page for this payment
  providerRef: string;     // FAC's reference for this payment, stored with record_payment_started
}
export interface FacVerifyResult {
  status: "succeeded" | "pending" | "failed";
  amount: number;
  currency: "JMD" | "USD";
  txnId: string;
  providerStatus: string;
}

class FacNotReady extends Error {
  constructor() {
    super("Card payments (NCB / First Atlantic Commerce) are awaiting merchant integration.");
  }
}

// 1. start a payment on FAC's hosted page
export function facStartPayment(_p: FacStart): Promise<FacStartResult> {
  return Promise.reject(new FacNotReady());
}
// 2. ask FAC, server to server, for the real result of a payment
export function facVerifyPayment(_providerRef: string): Promise<FacVerifyResult> {
  return Promise.reject(new FacNotReady());
}
// 3. read and authenticate a notification from FAC (if FAC sends them)
export function facReadNotification(_req: Request): Promise<{ providerRef: string; eventId: string } | null> {
  return Promise.reject(new FacNotReady());
}
