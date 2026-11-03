// FAQ content (BRIEF §4.11), shared by the FAQ section markup and the FAQPage
// JSON-LD (src/sections/jsonld). Isomorphic (Node at build time + browser).
// Every answer is assembled from BUSINESS facts only — nothing invented.
// Each item: { id, q, html (answer markup), text (plain answer for JSON-LD) }.
import { esc } from "../../lib/format.js";
import { hoursTable } from "../../lib/hours.js";
import { whatsappEnabled, waLink } from "../../lib/contact.js";

/** "a, b and c" */
const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

export function faqItems(B) {
  const P = B.products;
  const has = (fn) => P.some(fn);
  const mat = (m) => (p) => (p.material || "").toLowerCase().includes(m);

  // 1. Materials: only those present in the catalogue.
  const materials = [
    has(mat("aluminium")) && "aluminium",
    has(mat("upvc")) && "uPVC",
    has(mat("steel")) && P.some((p) => p.material === "Steel") && "steel",
    has(mat("wrought iron")) && "wrought iron with mahogany",
    has(mat("glass")) && "frameless glass",
  ].filter(Boolean);
  const railing = P.find((p) => p.cat === "railings");
  const marine = railing && /316 marine-grade stainless/i.test(railing.spec || "");
  const blinds = P.filter((p) => p.cat === "blinds").map((p) => p.name.toLowerCase());
  const matText = `We work with ${list(materials)}. That covers windows and doors, frameless glass showers${marine ? " and glass railings on 316 marine-grade stainless posts" : ""}${blinds.length ? `, plus ${list(blinds)}` : ""}.`;

  // 2. Install: sectors from the strapline ("Commercial, Domestic, Industrial").
  const sectors = (B.strapline.split("·").pop() || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const installText = `Yes. We install for ${list(sectors)} projects. Book a free site visit and we will come and look at your job.`;
  const installHtml = `Yes. We install for ${esc(list(sectors))} projects. <a href="#contact" data-booking-open>Book a free site visit</a> and we will come and look at your job.`;

  // 3. Finishes from B.finishes.
  const { residential, commercial } = B.finishes;
  const finText = `Windows, patio doors and entrance doors come in ${list(residential)}. Commercial doors and curtain wall come in ${list(commercial)}.`;
  const finHtml = `${esc(finText)} <a href="#finishes">Try the finishes</a>.`;

  // 4. uPVC near the sea (facts from BUSINESS product notes / BRIEF §3).
  const seaText = `Yes. uPVC is coastal-weather resistant and termite resistant, and it is energy efficient with sound insulation.${marine ? " For railings we use 316 marine-grade stainless posts." : ""}`;
  const seaHtml = `${esc(seaText)} <a href="#why">Compare aluminium and uPVC</a>.`;

  // 5. Getting a price. WhatsApp appears automatically once BUSINESS.whatsapp is confirmed.
  const wa = whatsappEnabled(B) ? waLink(B, `Hi ${B.name}, I'd like a price for `) : null;
  const priceText = `Use the quote estimator on this page, ${wa ? "send us a WhatsApp, " : ""}call your nearest branch or email ${B.email}. Tell us the product, size and quantity and we will send your exact price.`;
  const priceHtml = `Use the <a href="#quote">quote estimator</a>, ${wa ? `<a href="${esc(wa)}" target="_blank" rel="noopener">send us a WhatsApp</a>, ` : ""}<a href="#branches">call your nearest branch</a> or email <a href="mailto:${esc(B.email)}">${esc(B.email)}</a>. Tell us the product, size and quantity and we will send your exact price.`;

  // 6. Hours table.
  // TODO(business): hours sources conflict (see config.js) — confirm, per branch if different.
  const rows = hoursTable(B.hours);
  const hoursText = `${rows.map((r) => `${r.day}: ${r.text}`).join(". ")}. Times are Jamaica time.`;
  const hoursHtml = `<table class="faq-hours"><caption class="visually-hidden">Opening hours</caption><tbody>${rows
    .map((r) => `<tr><th scope="row">${esc(r.day)}</th><td class="tnum">${esc(r.text)}</td></tr>`).join("")}</tbody></table><p class="faq-note">Times are Jamaica time.</p>`;

  // 7. Also stocks.
  const stock = B.alsoStocks.map(lower);
  const stockText = `Yes. As well as windows and doors we stock ${list(stock)}. Ask your nearest branch what is in stock.`;
  const stockHtml = `Yes. As well as windows and doors we stock ${esc(list(stock))}. Ask <a href="#branches">your nearest branch</a> what is in stock.`;

  // 8. Where.
  const names = B.branches.map((b) => b.name.replace(/\s*\(.*\)\s*/, ""));
  const head = B.branches.find((b) => /head office/i.test(b.name));
  const whereText = `We have ${B.branches.length} branches across western and central Jamaica: ${list(names)}.${head ? ` Our head office is at ${head.address}.` : ""}`;
  const whereHtml = `${esc(whereText)} <a href="#branches">Find your nearest branch</a>.`;

  return [
    { id: "materials", q: "What materials do you work with?", text: matText, html: esc(matText) },
    { id: "install", q: "Do you install?", text: installText, html: installHtml },
    { id: "finishes", q: "Which finishes are available?", text: finText, html: finHtml },
    { id: "sea", q: "Is uPVC good near the sea?", text: seaText, html: seaHtml },
    { id: "price", q: "How do I get a price?", text: priceText, html: priceHtml },
    { id: "hours", q: "What are your hours?", text: hoursText, html: hoursHtml },
    { id: "stock", q: "Do you sell tiles and fixtures?", text: stockText, html: stockHtml },
    { id: "where", q: "Where are you?", text: whereText, html: whereHtml },
  ];
}
