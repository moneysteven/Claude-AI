import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { getActiveBusinessBySlug, loadCalendarRules } from "@/lib/business";
import { describeOpenNow, describeWeeklyHours } from "@/lib/hours";
import { priceLabel } from "@/lib/money";
import { formatPhone } from "@/lib/phone";
import { tenantDb } from "@/lib/tenant";
import { BookButton } from "./BookButton";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Widget demo" };

/**
 * A stand-in "client website" (a polished small-business landing page) with
 * the widget embedded exactly as on a real site, for demos and the
 * end-to-end tests. Uses the business's own brand colour, services and hours.
 */
export default async function DemoSite({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await getActiveBusinessBySlug(slug);
  if (!business) notFound();
  // The page's Content Security Policy only runs scripts carrying this request's nonce.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // Signed-in staff get a way back; visitors (e.g. a prospect you show it to) see only the pretend website.
  const user = await currentUser();
  const backHref = user?.role === "SUPER_ADMIN" ? `/admin/businesses/${business.id}` : "/dashboard";

  const [services, rules] = await Promise.all([
    tenantDb(business.id).service.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], take: 9 }),
    loadCalendarRules(business.id),
  ]);
  const weekly = describeWeeklyHours(rules.weekly).map((line) => {
    const i = line.indexOf(": ");
    return { day: line.slice(0, i), hours: line.slice(i + 2) };
  });
  const openNow = describeOpenNow(rules, new Date());
  const place = [business.area, business.parish].filter(Boolean).join(", ");
  const brand = business.brandColor;
  const ink = business.brandTextColor;

  const css = `
    .site { --b: ${brand}; --ink: ${ink}; min-height: 100vh; background: #fbf8f6; color: #221a20; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .site * { box-sizing: border-box; }
    .site .bar { background: #111018; color: #fff; padding: .6rem 1rem; display: flex; gap: .75rem; justify-content: space-between; align-items: center; flex-wrap: wrap; font-size: 14px; }
    .site .bar a { color: #fff; font-weight: 700; }
    .site .hero { position: relative; overflow: hidden; color: var(--ink); padding: 5.5rem 1.5rem 6.5rem; text-align: center;
      background: radial-gradient(120% 90% at 10% 0%, color-mix(in srgb, var(--b) 70%, #fff) 0%, transparent 55%),
                  radial-gradient(90% 80% at 100% 100%, color-mix(in srgb, var(--b) 60%, #000) 0%, transparent 60%), var(--b); }
    .site .hero::before, .site .hero::after { content: ""; position: absolute; border-radius: 50%; filter: blur(50px); opacity: .55; pointer-events: none; }
    .site .hero::before { width: 380px; height: 380px; left: -90px; top: -120px; background: color-mix(in srgb, var(--b) 40%, #fff); animation: float1 14s ease-in-out infinite alternate; }
    .site .hero::after { width: 420px; height: 420px; right: -120px; bottom: -180px; background: color-mix(in srgb, var(--b) 50%, #ff8fb1); animation: float2 18s ease-in-out infinite alternate; }
    @keyframes float1 { to { transform: translate(120px, 60px) scale(1.15); } }
    @keyframes float2 { to { transform: translate(-140px, -40px) scale(1.1); } }
    .site .hero > * { position: relative; z-index: 1; }
    .site .eyebrow { display: inline-block; font-size: 13px; letter-spacing: .14em; text-transform: uppercase; font-weight: 700; padding: .4rem .9rem; border-radius: 999px; background: rgba(255,255,255,.18); box-shadow: inset 0 0 0 1px rgba(255,255,255,.3); animation: up .9s cubic-bezier(.22,1,.36,1) both; }
    .site h1 { font-family: "Didot", "Bodoni 72", Georgia, "Times New Roman", serif; font-size: clamp(2.6rem, 8vw, 4.6rem); line-height: 1.02; letter-spacing: -.02em; margin: 1rem 0 .8rem; font-weight: 700; animation: up 1s cubic-bezier(.22,1,.36,1) .08s both; }
    .site .tag { font-size: 1.15rem; max-width: 34rem; margin: 0 auto; opacity: .95; animation: up 1s cubic-bezier(.22,1,.36,1) .16s both; }
    .site .ctas { display: flex; gap: .75rem; justify-content: center; flex-wrap: wrap; margin-top: 2rem; animation: up 1s cubic-bezier(.22,1,.36,1) .24s both; }
    .site .cta { font: inherit; font-weight: 700; font-size: 1rem; border: 0; cursor: pointer; text-decoration: none; padding: .95rem 1.5rem; border-radius: 999px; transition: transform .45s cubic-bezier(.34,1.56,.64,1), box-shadow .3s; }
    .site .cta.main { background: #fff; color: #1d1320; box-shadow: 0 16px 34px rgba(0,0,0,.25); }
    .site .cta.ghost { background: rgba(255,255,255,.16); color: var(--ink); box-shadow: inset 0 0 0 1.5px rgba(255,255,255,.55); }
    .site .cta:hover { transform: translateY(-3px) scale(1.03); }
    .site .cta:active { transform: scale(.96); }
    .site .open { margin-top: 1.4rem; font-size: .95rem; opacity: .95; animation: up 1s cubic-bezier(.22,1,.36,1) .32s both; }
    .site .open::before { content: ""; display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #34c759; margin-right: .5rem; box-shadow: 0 0 0 4px rgba(52,199,89,.25); vertical-align: middle; }
    @keyframes up { from { opacity: 0; transform: translateY(26px); } to { opacity: 1; transform: none; } }
    .site main { max-width: 1040px; margin: -3.5rem auto 0; padding: 0 1.25rem 4rem; position: relative; z-index: 2; }
    .site .panel { background: #fff; border-radius: 28px; box-shadow: 0 30px 70px rgba(40,20,40,.12), 0 0 0 1px rgba(0,0,0,.04); padding: 2rem; margin-bottom: 1.5rem; animation: up 1s cubic-bezier(.22,1,.36,1) .3s both; }
    .site h2 { font-family: "Didot", "Bodoni 72", Georgia, serif; font-size: 2rem; margin: 0 0 1.25rem; letter-spacing: -.01em; }
    .site .svc { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: .9rem; }
    .site .svc div { border-radius: 18px; padding: 1rem 1.1rem; background: #faf6f8; box-shadow: inset 0 0 0 1px rgba(0,0,0,.05); transition: transform .45s cubic-bezier(.34,1.56,.64,1), box-shadow .3s; }
    .site .svc div:hover { transform: translateY(-4px); box-shadow: 0 16px 30px rgba(40,20,40,.12), inset 0 0 0 1.5px color-mix(in srgb, var(--b) 45%, transparent); }
    .site .svc b { display: block; font-size: 1.05rem; }
    .site .svc span { color: #5b4f58; font-size: .95rem; }
    .site .price { color: color-mix(in srgb, var(--b) 85%, #000); font-weight: 800; }
    .site .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
    .site table { width: 100%; border-collapse: collapse; background: transparent; }
    .site td { padding: .55rem 0; border-bottom: 1px solid #f0e9ee; font-size: .98rem; }
    .site td:last-child { text-align: right; color: #4a3f48; }
    .site tr:last-child td { border-bottom: 0; }
    .site p { line-height: 1.6; }
    .site footer { text-align: center; color: #6b5f68; font-size: .9rem; padding: 0 1rem 6rem; }
    .site details { max-width: 640px; margin: .75rem auto 0; text-align: left; }
    .site pre { background: #f4eef2; padding: 1rem; border-radius: 14px; overflow-x: auto; font-size: 13px; }
    @media (max-width: 480px) { .site .hero { padding: 4rem 1.25rem 5.5rem; } .site .eyebrow { letter-spacing: .1em; font-size: 12px; } .site .panel { padding: 1.4rem; border-radius: 24px; } }
    @media (prefers-reduced-motion: reduce) { .site *, .site *::before, .site *::after { animation: none !important; transition: none !important; } }
  `;

  return (
    <div className="site">
      <style>{css}</style>
      {user ? (
        <div className="bar">
          <span>Preview of {business.name}&apos;s website chat. Tap the bubble at the bottom right.</span>
          <a href={backHref}>&larr; Back to {user.role === "SUPER_ADMIN" ? "admin" : "dashboard"}</a>
        </div>
      ) : null}
      <header className="hero">
        <span className="eyebrow">{business.area || business.parish || "Jamaica"}</span>
        <h1>{business.name}</h1>
        <p className="tag">Book in seconds, any time. Ask us anything, in English or Patois: our assistant {business.assistantName} answers right away.</p>
        <div className="ctas">
          <BookButton className="cta main">Book an appointment</BookButton>
          {business.phoneMain ? (
            <a className="cta ghost" href={`tel:${business.phoneMain}`}>
              Call {formatPhone(business.phoneMain)}
            </a>
          ) : null}
        </div>
        <p className="open">{openNow}</p>
      </header>
      <main>
        {services.length ? (
          <section className="panel">
            <h2>Services & prices</h2>
            <div className="svc">
              {services.map((s) => (
                <div key={s.id}>
                  <b>{s.name}</b>
                  <span>
                    <span className="price">{priceLabel(s.priceCents, { isFrom: s.priceIsFrom })}</span> · {s.durationMin} min
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <div className="two">
          <section className="panel">
            <h2>Opening hours</h2>
            <table>
              <tbody>
                {weekly.map((w) => (
                  <tr key={w.day}>
                    <td>{w.day}</td>
                    <td>{w.hours}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="panel">
            <h2>Find us</h2>
            <p>
              <strong>{[business.addressLine, place].filter(Boolean).join(", ")}</strong>
            </p>
            {business.directions ? <p>{business.directions}</p> : null}
            {business.phoneMain ? (
              <p>
                Call or WhatsApp: <strong>{formatPhone(business.phoneMain)}</strong>
              </p>
            ) : null}
          </section>
        </div>
      </main>
      <footer>
        <p>This is a demo website. The chat and booking bubble is Conroy, added with one line of code.</p>
        <details>
          <summary>Embed code used on this page</summary>
          <pre>{`<script src="${process.env.APP_URL ?? ""}/widget.js" data-business="${business.slug}" defer></script>`}</pre>
        </details>
      </footer>
      <script src="/widget.js" data-business={business.slug} defer nonce={nonce} />
    </div>
  );
}
