// Sticky mobile action bar (<768px) + the "pick a branch to call" sheet
// (BRIEF §4). The sheet is opened by [data-callsheet-open] clicks and by the
// window event 'callsheet:open'. Without JS, "Call" jumps to the branch finder.
import { ICON } from "../header/markup.js";

const WA = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M4.5 19.5l1.1-3.9A8 8 0 1 1 8.6 18.5l-4.1 1Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.2 8.6c.2-.5.6-.5.9-.5.6 0 .9 1.6 1 1.9.1.4-.6.9-.6 1.1.4.9 1.2 1.7 2.2 2.2.2 0 .7-.7 1.1-.6.3.1 1.9.5 1.9 1 0 .4-.1.8-.5 1-1.3.9-3.5-.2-4.7-1.4S8.6 9.8 9.2 8.6Z" fill="currentColor"/></svg>`;

export default function mobilebar({ B, fmt, contact }) {
  const wa = contact.whatsappEnabled(B)
    ? `<a class="mbar__btn" href="${fmt.esc(contact.waLink(B, `Hi ${B.name}, `))}" target="_blank" rel="noopener">${WA}<span>WhatsApp</span></a>`
    : ""; // TODO(business): confirm WhatsApp number (BUSINESS.whatsapp); the button appears automatically once set

  const branch = (b) => `<li class="csheet__branch">
        <div class="csheet__name"><strong>${fmt.esc(b.name)}</strong><span>${fmt.esc(b.address)}</span></div>
        <div class="csheet__phones">${b.phones.map((p) => `<a class="csheet__tel" href="${fmt.telHref(p)}" aria-label="Call ${fmt.esc(b.name)}, ${fmt.phoneDisplay(p)}">${ICON.phone}<span class="tnum">${fmt.phoneDisplay(p)}</span></a>`).join("")}</div>
      </li>`;

  return `<div class="mbar-spacer" aria-hidden="true"></div>
<nav class="mbar" aria-label="Quick actions" data-mbar>
  <a class="mbar__btn" href="#branches" data-callsheet-open aria-haspopup="dialog">${ICON.phone}<span>Call</span></a>
  ${wa}
  <a class="mbar__btn mbar__btn--primary" href="#quote">${ICON.quote}<span>Get Quote</span></a>
</nav>
<dialog class="csheet" id="callsheet" aria-labelledby="csheet-title" data-lenis-prevent>
  <div class="csheet__panel">
    <div class="csheet__grip" aria-hidden="true"></div>
    <div class="csheet__head">
      <div>
        <h2 class="csheet__title" id="csheet-title">Call a branch</h2>
        <p class="csheet__status" data-csheet-status></p>
      </div>
      <button type="button" class="icon-btn csheet__close" data-dialog-close aria-label="Close">${ICON.close}</button>
    </div>
    <ul class="csheet__list">
      ${B.branches.map(branch).join("")}
    </ul>
  </div>
</dialog>`;
}
