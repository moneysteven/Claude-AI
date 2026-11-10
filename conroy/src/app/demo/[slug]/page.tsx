import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getActiveBusinessBySlug } from "@/lib/business";
import { formatPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Widget demo" };

/**
 * A stand-in "client website" with the widget embedded exactly as on a real
 * site, for demos and the end-to-end test.
 */
export default async function DemoSite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getActiveBusinessBySlug(slug);
  if (!business) notFound();
  // The page's Content Security Policy only runs scripts carrying this request's nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: "#222", fontFamily: "Georgia, serif" }}>
      <header style={{ background: business.brandColor, color: business.brandTextColor, padding: "3rem 1.5rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "2.2rem", margin: 0 }}>{business.name}</h1>
        <p style={{ margin: "0.5rem 0 0" }}>{[business.area, business.parish].filter(Boolean).join(", ")}</p>
      </header>
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1.5rem" }}>
        <h2>Welcome</h2>
        <p>
          This is a demo page showing how the Conroy chat and booking widget looks on a client&apos;s website. Click the chat bubble in the
          corner to ask a question (try &quot;unnu open today?&quot; or &quot;how much fi a silk press?&quot;) or open the Book tab.
        </p>
        {business.phoneMain ? (
          <p>
            Call us: <strong>{formatPhone(business.phoneMain)}</strong>
          </p>
        ) : null}
        <h3>Embed code used on this page</h3>
        <pre style={{ background: "#f5f5f5", padding: "1rem", overflowX: "auto", fontSize: 13 }}>
          {`<script src="${process.env.APP_URL ?? ""}/widget.js" data-business="${business.slug}" defer></script>`}
        </pre>
      </main>
      <script src="/widget.js" data-business={business.slug} defer nonce={nonce} />
    </div>
  );
}
