// ============================================================
// EmailJS Configuration — Waitlist Confirmation Email
// ============================================================
// 📧 HOW TO SET UP:
//   1. Go to https://www.emailjs.com and create a free account
//   2. Add your email service (Gmail, Outlook, or custom domain)
//      → Copy the SERVICE_ID below
//   3. Create a new email template using the HTML provided in
//      the email_template.html file in the project artifacts
//      → Copy the TEMPLATE_ID below
//   4. Go to Account → API Keys
//      → Copy the PUBLIC_KEY below
//
// TEMPLATE VARIABLES (set these in your EmailJS template):
//   {{to_email}}   — subscriber's email (sent TO this address)
//   {{to_name}}    — "there" (greeting placeholder)
// ============================================================

import emailjs from '@emailjs/browser'

// ── Replace these with your actual EmailJS credentials ──────
const EMAILJS_SERVICE_ID = 'service_babl3s9'
const EMAILJS_TEMPLATE_ID = 'template_kl6avkh'
const EMAILJS_PUBLIC_KEY = 'PeFOT3ICW9k78kQyZ'

/**
 * Send a waitlist confirmation email to the subscriber.
 *
 * This is fire-and-forget — errors are logged but not thrown,
 * so it never blocks the main waitlist signup UX.
 */
export async function sendWaitlistConfirmation(email: string): Promise<void> {
  try {
    await emailjs.send(
      EMAILJS_SERVICE_ID,
      EMAILJS_TEMPLATE_ID,
      {
        to_email: email,
        to_name: 'there', // "Hey there" — friendly greeting
      },
      { publicKey: EMAILJS_PUBLIC_KEY }
    )
    console.log('✅ Waitlist confirmation email sent to:', email)
  } catch (error) {
    // Log but don't throw — we don't want a failed confirmation
    // email to ruin the user's waitlist signup experience
    console.warn('⚠️ Failed to send confirmation email:', error)
  }
}
