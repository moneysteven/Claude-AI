// Footer (BRIEF §4.12): navy, white text, aluminium hairlines. Rendered after </main>.
// All facts from BUSINESS. The mobile action bar's own spacer (.mbar-spacer, rendered
// after this footer) keeps the fixed bar from covering footer content (<768px).
import { footerLogo } from "./logo.js";

const IG = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor"/></svg>`;
const FB = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4V10.5H7.8v3h2.6V21" fill="currentColor"/></svg>`;
const PHONE = `<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" focusable="false"><path d="M6.6 2.5 8.4 6 6.9 7.6a10 10 0 0 0 5.5 5.5L14 11.6l3.5 1.8-.6 3a1.6 1.6 0 0 1-1.7 1.3A14 14 0 0 1 2.3 4.8a1.6 1.6 0 0 1 1.3-1.7Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

export default function footer(ctx) {
  const { B, fmt, hours, year } = ctx;
  const { esc, telHref, phoneDisplay } = fmt;

  const links = [
    ["Products", "#products"], ["Finishes", "#finishes"], ["Get a quote", "#quote"], ["Why uPVC or aluminium", "#why"],
    ["Projects", "#projects"], ["Showers & glass", "#showers"], ["Reviews", "#reviews"], ["Branches", "#branches"], ["FAQ", "#faq"],
  ];

  const branch = (b) => `<li class="ft-branch">
          <span class="ft-branch__name">${esc(b.name)}</span>
          <span class="ft-branch__phones">${b.phones.map((p) =>
            `<a class="ft-tel tnum" href="${telHref(p)}" aria-label="Call ${esc(b.name)}, ${phoneDisplay(p)}">${PHONE}${phoneDisplay(p)}</a>`).join("")}</span>
        </li>`;

  const social = [
    B.social?.instagram && `<a class="ft-social" href="${esc(B.social.instagram)}" target="_blank" rel="noopener" aria-label="${esc(B.name)} on Instagram (opens in a new tab)">${IG}</a>`,
    B.social?.facebook && `<a class="ft-social" href="${esc(B.social.facebook)}" target="_blank" rel="noopener" aria-label="${esc(B.name)} on Facebook (opens in a new tab)">${FB}</a>`,
  ].filter(Boolean).join("");

  return `<footer class="ft" id="footer" aria-labelledby="ft-title">
  <h2 id="ft-title" class="visually-hidden">${esc(B.name)}: contact, branches and opening hours</h2>
  <div class="container">
    <div class="ft-top">
      <div class="ft-brand">
        <a class="ft-logo" href="#top" aria-label="${esc(B.name)}, back to top">${footerLogo("ft-logo__svg")}</a>
        <p class="ft-mission">${esc(B.mission)}.</p>
        <p class="ft-since">Since ${esc(B.founded)} · ${esc(B.strapline.split("·").pop().trim())}</p>
        ${social ? `<div class="ft-socials">${social}</div>` : ""}
      </div>
      <nav class="ft-col" aria-label="Footer">
        <h3 class="ft-h">Explore</h3>
        <ul class="ft-links" role="list">
          ${links.map(([l, h]) => `<li><a href="${h}">${esc(l)}</a></li>`).join("\n          ")}
        </ul>
      </nav>
      <div class="ft-col">
        <h3 class="ft-h">Contact</h3>
        <p><a class="ft-email" href="mailto:${esc(B.email)}">${esc(B.email)}</a></p>
        <h3 class="ft-h ft-h--sub">Opening hours</h3>
        <table class="ft-hours">
          <caption class="visually-hidden">Opening hours, Jamaica time</caption>
          <tbody>
          ${hours.hoursTable(B.hours).map((r) => `<tr><th scope="row">${esc(r.day)}</th><td class="tnum">${esc(r.text)}</td></tr>`).join("\n          ")}
          </tbody>
        </table>
        <!-- TODO(business): hours sources conflict (see config.js); confirm before launch -->
      </div>
    </div>
    <div class="ft-branches">
      <h3 class="ft-h">Our ${B.branches.length} branches</h3>
      <ul class="ft-branch-list" role="list">
        ${B.branches.map(branch).join("\n        ")}
      </ul>
    </div>
    <div class="ft-bottom">
      <p>© ${year} ${esc(B.legalName)}</p>
      <p>Stock imagery: Pexels</p>
      <p><a href="#top">Back to top</a></p>
    </div>
  </div>
</footer>`;
}
