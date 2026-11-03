// Structured data (BRIEF §8): HomeAndConstructionBusiness with every branch as a
// department, plus FAQPage built from the FAQ section's own data module.
// Markup only (no client JS). All values come from BUSINESS.
import { faqItems } from "../faq/data.js";

const SITE = "https://homesolutionsjm.com/";
// "<" escaped so text can never close the <script> element.
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;

export default function jsonld({ B, fmt, hours }) {
  const opening = hours.openingHoursSpec(B.hours);
  const tel = (p) => fmt.telHref(p).replace(/^tel:/, "");
  const parts = (addr) => addr.split(",").map((s) => s.trim());

  const department = B.branches.map((b) => {
    const a = parts(b.address);
    const dep = {
      "@type": "HomeAndConstructionBusiness",
      "@id": `${SITE}#branch-${b.id}`,
      name: `${B.name} ${b.name}`,
      address: {
        "@type": "PostalAddress",
        streetAddress: a.slice(0, Math.max(1, a.length - 2)).join(", "),
        addressLocality: a.length >= 2 ? a[a.length - 2] : undefined,
        addressRegion: a.length >= 3 ? a[a.length - 1] : undefined,
        addressCountry: "JM",
      },
      telephone: b.phones.length === 1 ? tel(b.phones[0]) : b.phones.map(tel),
      openingHoursSpecification: opening,
    };
    if (b.fax) dep.faxNumber = b.fax;
    // Only publish coordinates we actually know (approx pins are town-level guesses).
    if (!b.approx && typeof b.lat === "number" && typeof b.lng === "number") dep.geo = { "@type": "GeoCoordinates", latitude: b.lat, longitude: b.lng };
    return dep;
  });

  const business = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    "@id": `${SITE}#business`,
    name: B.name,
    legalName: B.legalName,
    foundingDate: String(B.founded),
    email: B.email,
    url: SITE,
    logo: `${SITE}img/logo-navy.png`,
    image: `${SITE}og-image.jpg`,
    slogan: B.tagline,
    description: B.mission,
    areaServed: { "@type": "Country", name: "Jamaica" },
    sameAs: Object.values(B.social || {}).filter(Boolean),
    department,
  };

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems(B).map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.text } })),
  };

  return `${ld(business)}\n${ld(faqPage)}`;
}
