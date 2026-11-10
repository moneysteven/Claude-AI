import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActiveBusinessBySlug } from "@/lib/business";
import { formatPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacy notice" };

/**
 * Default privacy notice for a business's AI assistant (Jamaica Data
 * Protection Act 2020). Businesses with their own notice set
 * privacyNoticeUrl instead. Template text: have it reviewed by a lawyer.
 */
export default async function PrivacyNotice({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const b = await getActiveBusinessBySlug(slug);
  if (!b) notFound();
  const contact = [b.email, b.phoneMain ? formatPhone(b.phoneMain) : null].filter(Boolean).join(" or ");
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1.25rem", lineHeight: 1.6 }}>
      <h1>Privacy notice: {b.name}&apos;s AI assistant</h1>
      <p>
        {b.name} (&quot;we&quot;) uses an AI assistant called {b.assistantName} to answer phone calls, WhatsApp messages and website chats, to book
        appointments and to take messages. This notice explains what personal data the assistant collects and how we use it, in line with the
        Jamaica Data Protection Act, 2020.
      </p>
      <h2>Who is responsible</h2>
      <p>
        {b.name} is the data controller{b.addressLine ? ` (${[b.addressLine, b.area, b.parish].filter(Boolean).join(", ")})` : ""}. Steven Scale
        Solutions provides and operates the assistant for us as a data processor, under a written agreement.
        {contact ? ` Contact us about your data at ${contact}.` : ""}
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>Your name, phone/WhatsApp number and what you ask for (for example the service, date and time you want).</li>
        <li>Call recordings and transcripts, and the text of chat and WhatsApp messages with the assistant.</li>
        <li>Booking and payment-request details (we never receive or store card numbers; payments are made on Fygaro or WiPay&apos;s secure pages).</li>
      </ul>
      <p>We only ask for what we need to help you. Please don&apos;t share medical, financial or other sensitive details with the assistant.</p>
      <h2>Why we use it</h2>
      <ul>
        <li>To answer your questions, book, change or cancel appointments, and send confirmations and reminders by WhatsApp.</li>
        <li>To pass messages to our team and let the owner know about calls.</li>
        <li>To keep records of bookings and improve our service.</li>
      </ul>
      <h2>AI and recording</h2>
      <p>
        You are talking to an AI assistant, not a person. Calls may be recorded and transcribed. You can ask for a person at any time; in a chat,
        type &quot;talk to a person&quot;.
      </p>
      <h2>Who we share it with</h2>
      <p>
        Only service providers that run the assistant for us (telephone, WhatsApp, calendar, hosting and AI providers), under contracts that
        protect your data. Some of these providers process data outside Jamaica; we use providers with appropriate safeguards.
      </p>
      <h2>How long we keep it</h2>
      <p>
        Call recordings, transcripts and chat messages are deleted automatically after {b.retentionDays} days. Booking records are kept as long
        as needed for our business records.
      </p>
      <h2>Your rights</h2>
      <p>
        You can ask for a copy of your data, ask us to correct or delete it, or object to how we use it. Reply STOP on WhatsApp to stop
        reminders and updates. To make a request, contact us{contact ? ` at ${contact}` : ""}. You may also complain to the Office of the
        Information Commissioner of Jamaica.
      </p>
      <p style={{ color: "#666", fontSize: 13 }}>Last updated: {new Date().getFullYear()}.</p>
    </main>
  );
}
