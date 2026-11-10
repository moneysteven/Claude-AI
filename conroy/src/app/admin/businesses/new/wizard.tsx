"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildVoiceGreeting } from "@/lib/greeting";
import { PRESET_HOURS, PRESET_POLICIES, PRESET_SERVICES, SUGGESTED_FAQS } from "@/lib/onboarding/presets";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  PARISHES,
  POLICY_KINDS,
  STEP_FOR_SECTION,
  WEBSITE_PLATFORMS,
  type Category,
  type FieldErrors,
  type OnboardingInput,
} from "@/lib/onboarding/schema";
import { submitOnboardingAction, type LaunchResult } from "./actions";

export interface WizardProps {
  holidays: { key: string; name: string }[];
  plans: { code: "LITE" | "STARTER" | "GROWTH"; name: string; price: string; minutes: number; messages: number }[];
  googleServiceAccount: string | null;
  retellReady: boolean;
}

const DRAFT_KEY = "conroy:onboarding-draft:v1";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const STEPS = ["Business", "Contacts & owner", "Hours & holidays", "Staff", "Services & prices", "FAQs & policies", "Assistant", "Payment links", "Calendar & plan", "Review & create"];

function blankService(name = "", durationMin = 30): OnboardingInput["services"][number] {
  return { name, durationMin, price: "", priceIsFrom: false, deposit: "", staffNames: [], description: "" };
}

function initialData(category: Category = "SALON"): OnboardingInput {
  return {
    business: { name: "", category, addressLine: "", area: "", parish: "Kingston", directions: "", email: "", websiteUrl: "", websitePlatform: "WordPress" },
    phones: { phoneMain: "", whatsappNumber: "", ownerWhatsapp: "", handoffNumber: "", voiceNumber: "" },
    hours: PRESET_HOURS[category].map((h) => ({ ...h })),
    holidaysOpen: [],
    staff: [],
    services: PRESET_SERVICES[category].map((s) => blankService(s.name, s.durationMin)),
    faqs: [],
    policies: PRESET_POLICIES.map((p) => ({ ...p })),
    assistant: { assistantName: "Conroy", tone: "JAMAICAN_ENGLISH", greeting: "", extraKnowledge: "" },
    payments: [],
    calendar: { provider: "INTERNAL", googleCalendarId: "", calcomApiKey: "", calcomEventTypeId: "" },
    plan: "STARTER",
    owner: { name: "", email: "" },
    options: { goLive: true, createVoiceAgent: true },
  };
}

function ErrorText({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} role="alert" style={{ color: "var(--danger)", fontWeight: 500, fontSize: "0.85rem" }}>
      {message}
    </span>
  );
}

export function OnboardingWizard({ holidays, plans, googleServiceAccount, retellReady }: WizardProps) {
  const [data, setData] = useState<OnboardingInput>(() => initialData());
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [launch, setLaunch] = useState<LaunchResult | null>(null);
  const [loadedDraft, setLoadedDraft] = useState(false);

  // Restore / save the draft in this browser (it never leaves the device until submitted).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setData({ ...initialData(), ...JSON.parse(raw) });
    } catch {
      /* ignore broken drafts */
    }
    setLoadedDraft(true);
  }, []);
  useEffect(() => {
    if (!loadedDraft || launch) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    } catch {
      /* storage full or blocked */
    }
  }, [data, loadedDraft, launch]);

  const err = (path: string) => errors[path];
  const invalid = (path: string) => (errors[path] ? { "aria-invalid": true as const, "aria-describedby": `e-${path}` } : {});
  const stepHasErrors = (i: number) => Object.keys(errors).some((k) => STEP_FOR_SECTION[k.split(".")[0]] === i);

  function patch<K extends "business" | "phones" | "assistant" | "calendar" | "owner" | "options">(key: K, value: Partial<OnboardingInput[K]>) {
    setData((d) => ({ ...d, [key]: { ...d[key], ...value } }));
  }
  function setRow<K extends "hours" | "staff" | "services" | "faqs" | "policies" | "payments">(key: K, i: number, value: Partial<OnboardingInput[K][number]>) {
    setData((d) => ({ ...d, [key]: (d[key] as OnboardingInput[K][number][]).map((row, j) => (j === i ? { ...row, ...value } : row)) }));
  }
  function addRow<K extends "staff" | "services" | "faqs" | "policies" | "payments">(key: K, row: OnboardingInput[K][number]) {
    setData((d) => ({ ...d, [key]: [...(d[key] as OnboardingInput[K][number][]), row] }));
  }
  function removeRow<K extends "staff" | "services" | "faqs" | "policies" | "payments">(key: K, i: number) {
    setData((d) => ({ ...d, [key]: (d[key] as OnboardingInput[K][number][]).filter((_, j) => j !== i) }));
  }

  function applyCategoryPresets() {
    const c = data.business.category;
    setData((d) => ({
      ...d,
      hours: PRESET_HOURS[c].map((h) => ({ ...h })),
      services: PRESET_SERVICES[c].map((s) => blankService(s.name, s.durationMin)),
    }));
  }

  function renameStaff(i: number, name: string) {
    const old = data.staff[i].name;
    setData((d) => ({
      ...d,
      staff: d.staff.map((s, j) => (j === i ? { ...s, name } : s)),
      services: d.services.map((s) => ({ ...s, staffNames: s.staffNames.map((n) => (n === old ? name : n)) })),
    }));
  }

  const greetingPreview = useMemo(
    () =>
      buildVoiceGreeting({
        name: data.business.name || "the business",
        assistantName: data.assistant.assistantName || "Conroy",
        category: data.business.category,
        greeting: data.assistant.greeting || null,
        timezone: "America/Jamaica",
      }),
    [data.business.name, data.business.category, data.assistant.assistantName, data.assistant.greeting],
  );

  const unpriced = data.services.filter((s) => !s.price).length;

  async function submit() {
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await submitOnboardingAction(data);
      if (res.ok) {
        setLaunch(res.launch);
        setErrors({});
        try {
          localStorage.removeItem(DRAFT_KEY);
        } catch {
          /* ignore */
        }
      } else {
        setErrors(res.errors);
        setMessage(res.message);
      }
    } catch (e) {
      setMessage(`Couldn't reach the server: ${(e as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (launch) return <LaunchScreen launch={launch} />;

  const h = data.hours;
  return (
    <div>
      <ol className="row" aria-label="Onboarding steps" style={{ listStyle: "none", padding: 0, gap: 6 }}>
        {STEPS.map((title, i) => (
          <li key={title}>
            <button
              type="button"
              className={i === step ? "small" : "small secondary"}
              aria-current={i === step ? "step" : undefined}
              onClick={() => setStep(i)}
              style={stepHasErrors(i) ? { borderColor: "var(--danger)", color: i === step ? undefined : "var(--danger)" } : undefined}
            >
              {i + 1}. {title}
            </button>
          </li>
        ))}
      </ol>

      {message ? (
        <div className="flash error" role="alert">
          {message}
          {Object.keys(errors).length ? (
            <ul style={{ margin: "0.5rem 0 0" }}>
              {Object.entries(errors).map(([path, msg]) => (
                <li key={path}>
                  <button type="button" className="small secondary" onClick={() => setStep(STEP_FOR_SECTION[path.split(".")[0]] ?? 0)}>
                    Fix
                  </button>{" "}
                  {msg}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <section className="card" aria-labelledby="step-title">
        <h2 id="step-title" style={{ marginTop: 0 }}>
          {step + 1}. {STEPS[step]}
        </h2>

        {step === 0 ? (
          <div className="stack" style={{ display: "grid", gap: "0.75rem", maxWidth: 640 }}>
            <label>
              Business name
              <input value={data.business.name} onChange={(e) => patch("business", { name: e.target.value })} maxLength={120} {...invalid("business.name")} />
              <ErrorText id="e-business.name" message={err("business.name")} />
            </label>
            <label>
              Type of business
              <select value={data.business.category} onChange={(e) => patch("business", { category: e.target.value as Category })}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <button type="button" className="small secondary" onClick={applyCategoryPresets}>
                Use typical hours &amp; services for a {CATEGORY_LABELS[data.business.category].toLowerCase()}
              </button>{" "}
              <small className="muted">(replaces hours and services; prices stay blank for the owner to fill)</small>
            </div>
            <label>
              Street address
              <input value={data.business.addressLine} onChange={(e) => patch("business", { addressLine: e.target.value })} maxLength={200} placeholder="Shop 7, 12 Constant Spring Road" />
            </label>
            <div className="row">
              <label style={{ flex: 1 }}>
                Area / town
                <input value={data.business.area} onChange={(e) => patch("business", { area: e.target.value })} maxLength={100} placeholder="Half Way Tree" />
              </label>
              <label style={{ flex: 1 }}>
                Parish
                <select value={data.business.parish} onChange={(e) => patch("business", { parish: e.target.value as OnboardingInput["business"]["parish"] })}>
                  {PARISHES.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Directions &amp; landmarks <small className="muted">(what a caller needs to find you)</small>
              <textarea value={data.business.directions} onChange={(e) => patch("business", { directions: e.target.value })} maxLength={1000} placeholder="Opposite the Texaco, upstairs above the pharmacy. Parking at the back." />
            </label>
            <div className="row">
              <label style={{ flex: 1 }}>
                Business email
                <input type="email" value={data.business.email} onChange={(e) => patch("business", { email: e.target.value })} {...invalid("business.email")} />
                <ErrorText id="e-business.email" message={err("business.email")} />
              </label>
              <label style={{ flex: 1 }}>
                Website
                <input type="url" value={data.business.websiteUrl} onChange={(e) => patch("business", { websiteUrl: e.target.value })} placeholder="https://..." {...invalid("business.websiteUrl")} />
                <ErrorText id="e-business.websiteUrl" message={err("business.websiteUrl")} />
              </label>
            </div>
            <label>
              Website platform
              <select value={data.business.websitePlatform} onChange={(e) => patch("business", { websitePlatform: e.target.value as OnboardingInput["business"]["websitePlatform"] })}>
                {WEBSITE_PLATFORMS.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {step === 1 ? (
          <div style={{ display: "grid", gap: "0.75rem", maxWidth: 640 }}>
            <p className="muted" style={{ margin: 0 }}>
              Any format works: 876-555-1234, (876) 555 1234 or 555-1234 (876 is added).
            </p>
            <div className="row">
              <label style={{ flex: 1 }}>
                Owner&apos;s name
                <input value={data.owner.name} onChange={(e) => patch("owner", { name: e.target.value })} {...invalid("owner.name")} />
                <ErrorText id="e-owner.name" message={err("owner.name")} />
              </label>
              <label style={{ flex: 1 }}>
                Owner&apos;s email <small className="muted">(dashboard login)</small>
                <input type="email" value={data.owner.email} onChange={(e) => patch("owner", { email: e.target.value })} {...invalid("owner.email")} />
                <ErrorText id="e-owner.email" message={err("owner.email")} />
              </label>
            </div>
            {(
              [
                ["ownerWhatsapp", "Owner's WhatsApp", "Gets the call summaries and alerts. Required."],
                ["phoneMain", "Business phone customers know", "Their Digicel/Flow number (can forward to Conroy)."],
                ["whatsappNumber", "Business WhatsApp number", "The number customers WhatsApp."],
                ["handoffNumber", "Live transfer number", "Where Conroy transfers callers who want a person."],
                ["voiceNumber", "Conroy's 876 number (if bought already)", "Leave blank if you'll buy it later."],
              ] as const
            ).map(([key, label, hint]) => (
              <label key={key}>
                {label}
                <input inputMode="tel" value={data.phones[key]} onChange={(e) => patch("phones", { [key]: e.target.value })} placeholder="876-555-1234" {...invalid(`phones.${key}`)} />
                <small className="muted">{hint}</small>
                <ErrorText id={`e-phones.${key}`} message={err(`phones.${key}`)} />
              </label>
            ))}
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Closed</th>
                    <th>Opens</th>
                    <th>Closes</th>
                    <th>Lunch from</th>
                    <th>Lunch to</th>
                  </tr>
                </thead>
                <tbody>
                  {h.map((row, i) => (
                    <tr key={row.weekday}>
                      <td>
                        {DAYS[row.weekday]}
                        <ErrorText id={`e-hours.${i}`} message={err(`hours.${i}`)} />
                      </td>
                      <td>
                        <input type="checkbox" aria-label={`${DAYS[row.weekday]} closed`} checked={row.isClosed} onChange={(e) => setRow("hours", i, { isClosed: e.target.checked })} />
                      </td>
                      {(["openTime", "closeTime", "breakStart", "breakEnd"] as const).map((f) => (
                        <td key={f}>
                          <input type="time" aria-label={`${DAYS[row.weekday]} ${f}`} disabled={row.isClosed} value={row[f]} onChange={(e) => setRow("hours", i, { [f]: e.target.value })} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="small secondary"
              onClick={() => {
                const mon = h[1];
                setData((d) => ({ ...d, hours: d.hours.map((row) => (row.weekday >= 2 && row.weekday <= 5 ? { ...mon, weekday: row.weekday } : row)) }));
              }}
            >
              Copy Monday to Tuesday-Friday
            </button>
            <h3>Public holidays</h3>
            <p className="muted">The business is closed on public holidays unless you tick them here.</p>
            <div className="row">
              {holidays.map((hol) => (
                <label key={hol.key} className="check">
                  <input
                    type="checkbox"
                    checked={data.holidaysOpen.includes(hol.key)}
                    onChange={(e) =>
                      setData((d) => ({ ...d, holidaysOpen: e.target.checked ? [...d.holidaysOpen, hol.key] : d.holidaysOpen.filter((k) => k !== hol.key) }))
                    }
                  />
                  Open on {hol.name}
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div>
            <p className="muted">Who takes appointments. Leave empty if customers just book &quot;the business&quot; (one appointment at a time).</p>
            {data.staff.map((s, i) => (
              <div key={i} className="card">
                <div className="row">
                  <label style={{ flex: 1 }}>
                    Name
                    <input value={s.name} onChange={(e) => renameStaff(i, e.target.value)} {...invalid(`staff.${i}.name`)} />
                    <ErrorText id={`e-staff.${i}.name`} message={err(`staff.${i}.name`)} />
                  </label>
                  <label style={{ flex: 1 }}>
                    Role / title
                    <input value={s.title} onChange={(e) => setRow("staff", i, { title: e.target.value })} placeholder="Senior stylist" />
                  </label>
                  <button type="button" className="small danger" onClick={() => removeRow("staff", i)} aria-label={`Remove ${s.name || "staff member"}`}>
                    Remove
                  </button>
                </div>
                <fieldset style={{ border: 0, padding: 0, margin: "0.5rem 0 0" }}>
                  <legend className="muted">Works on (during business hours)</legend>
                  <div className="row">
                    {SHORT_DAYS.map((d, wd) => (
                      <label key={d} className="check">
                        <input
                          type="checkbox"
                          checked={s.workDays.includes(wd)}
                          onChange={(e) => setRow("staff", i, { workDays: e.target.checked ? [...s.workDays, wd].sort() : s.workDays.filter((x) => x !== wd) })}
                        />
                        {d}
                      </label>
                    ))}
                  </div>
                  <ErrorText id={`e-staff.${i}.workDays`} message={err(`staff.${i}.workDays`)} />
                </fieldset>
              </div>
            ))}
            <button
              type="button"
              className="secondary"
              onClick={() => addRow("staff", { name: "", title: "", workDays: data.hours.filter((x) => !x.isClosed).map((x) => x.weekday) })}
            >
              + Add staff member
            </button>
          </div>
        ) : null}

        {step === 4 ? (
          <div>
            <p className="muted">
              Prices in J$. Leave a price blank and {data.assistant.assistantName || "Conroy"} will say &quot;price on consultation&quot;. Never guess a price.
            </p>
            <ErrorText id="e-services" message={err("services")} />
            {data.services.map((s, i) => (
              <div key={i} className="card">
                <div className="row">
                  <label style={{ flex: 2 }}>
                    Service
                    <input value={s.name} onChange={(e) => setRow("services", i, { name: e.target.value })} {...invalid(`services.${i}.name`)} />
                    <ErrorText id={`e-services.${i}.name`} message={err(`services.${i}.name`)} />
                  </label>
                  <label style={{ width: 110 }}>
                    Minutes
                    <input type="number" min={5} max={720} value={s.durationMin} onChange={(e) => setRow("services", i, { durationMin: Number(e.target.value) || 0 })} {...invalid(`services.${i}.durationMin`)} />
                  </label>
                  <label style={{ width: 130 }}>
                    Price J$
                    <input inputMode="decimal" value={s.price} onChange={(e) => setRow("services", i, { price: e.target.value })} placeholder="e.g. 4500" {...invalid(`services.${i}.price`)} />
                    <ErrorText id={`e-services.${i}.price`} message={err(`services.${i}.price`)} />
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={s.priceIsFrom} onChange={(e) => setRow("services", i, { priceIsFrom: e.target.checked })} /> &quot;from&quot;
                  </label>
                  <label style={{ width: 130 }}>
                    Deposit J$
                    <input inputMode="decimal" value={s.deposit} onChange={(e) => setRow("services", i, { deposit: e.target.value })} placeholder="optional" {...invalid(`services.${i}.deposit`)} />
                    <ErrorText id={`e-services.${i}.deposit`} message={err(`services.${i}.deposit`)} />
                  </label>
                  <button type="button" className="small danger" onClick={() => removeRow("services", i)} aria-label={`Remove ${s.name || "service"}`}>
                    Remove
                  </button>
                </div>
                {data.staff.length ? (
                  <div className="row" style={{ marginTop: 6 }}>
                    <span className="muted">Done by:</span>
                    {data.staff.map((p) => (
                      <label key={p.name} className="check">
                        <input
                          type="checkbox"
                          checked={s.staffNames.includes(p.name)}
                          onChange={(e) => setRow("services", i, { staffNames: e.target.checked ? [...s.staffNames, p.name] : s.staffNames.filter((n) => n !== p.name) })}
                        />
                        {p.name || "(unnamed)"}
                      </label>
                    ))}
                    <small className="muted">(none ticked = anyone)</small>
                  </div>
                ) : null}
                <ErrorText id={`e-services.${i}.staffNames`} message={err(`services.${i}.staffNames`)} />
                <label style={{ marginTop: 6 }}>
                  Short description <small className="muted">(optional)</small>
                  <input value={s.description} onChange={(e) => setRow("services", i, { description: e.target.value })} maxLength={300} />
                </label>
              </div>
            ))}
            <button type="button" className="secondary" onClick={() => addRow("services", blankService())}>
              + Add service
            </button>
          </div>
        ) : null}

        {step === 5 ? (
          <div>
            <h3 style={{ marginTop: 0 }}>Frequently asked questions</h3>
            {data.faqs.map((f, i) => (
              <div key={i} className="card">
                <label>
                  Question
                  <input value={f.question} onChange={(e) => setRow("faqs", i, { question: e.target.value })} {...invalid(`faqs.${i}.question`)} />
                  <ErrorText id={`e-faqs.${i}.question`} message={err(`faqs.${i}.question`)} />
                </label>
                <label>
                  Answer (in the owner&apos;s words)
                  <textarea value={f.answer} onChange={(e) => setRow("faqs", i, { answer: e.target.value })} {...invalid(`faqs.${i}.answer`)} />
                  <ErrorText id={`e-faqs.${i}.answer`} message={err(`faqs.${i}.answer`)} />
                </label>
                <button type="button" className="small danger" onClick={() => removeRow("faqs", i)}>
                  Remove
                </button>
              </div>
            ))}
            <div className="row">
              <button type="button" className="secondary" onClick={() => addRow("faqs", { question: "", answer: "" })}>
                + Add FAQ
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setData((d) => ({
                    ...d,
                    faqs: [
                      ...d.faqs,
                      ...SUGGESTED_FAQS[d.business.category].filter((q) => !d.faqs.some((f) => f.question === q)).map((q) => ({ question: q, answer: "" })),
                    ],
                  }))
                }
              >
                Add common questions for this type of business
              </button>
            </div>
            <h3>Policies</h3>
            {data.policies.map((p, i) => (
              <div key={i} className="card">
                <div className="row">
                  <label>
                    Kind
                    <select value={p.kind} onChange={(e) => setRow("policies", i, { kind: e.target.value as (typeof POLICY_KINDS)[number] })}>
                      {POLICY_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {k.toLowerCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label style={{ flex: 1 }}>
                    Title
                    <input value={p.title} onChange={(e) => setRow("policies", i, { title: e.target.value })} {...invalid(`policies.${i}.title`)} />
                  </label>
                  <button type="button" className="small danger" onClick={() => removeRow("policies", i)}>
                    Remove
                  </button>
                </div>
                <label>
                  Policy
                  <textarea value={p.body} onChange={(e) => setRow("policies", i, { body: e.target.value })} {...invalid(`policies.${i}.body`)} />
                  <ErrorText id={`e-policies.${i}.body`} message={err(`policies.${i}.body`) ?? err(`policies.${i}.title`)} />
                </label>
              </div>
            ))}
            <button type="button" className="secondary" onClick={() => addRow("policies", { kind: "OTHER", title: "", body: "" })}>
              + Add policy
            </button>
          </div>
        ) : null}

        {step === 6 ? (
          <div style={{ display: "grid", gap: "0.75rem", maxWidth: 640 }}>
            <label>
              Assistant&apos;s name
              <input value={data.assistant.assistantName} onChange={(e) => patch("assistant", { assistantName: e.target.value })} maxLength={40} {...invalid("assistant.assistantName")} />
              <ErrorText id="e-assistant.assistantName" message={err("assistant.assistantName")} />
            </label>
            <fieldset style={{ border: 0, padding: 0 }}>
              <legend>
                <strong>Tone</strong>
              </legend>
              <label className="check">
                <input type="radio" name="tone" checked={data.assistant.tone === "JAMAICAN_ENGLISH"} onChange={() => patch("assistant", { tone: "JAMAICAN_ENGLISH" })} />
                Friendly Jamaican English
              </label>
              <label className="check">
                <input type="radio" name="tone" checked={data.assistant.tone === "LIGHT_PATOIS"} onChange={() => patch("assistant", { tone: "LIGHT_PATOIS" })} />
                Light Patois flavour in greetings and sign-offs only
              </label>
            </fieldset>
            <label>
              Custom phone greeting <small className="muted">(optional; the AI and recording notice is always added)</small>
              <textarea
                value={data.assistant.greeting}
                onChange={(e) => patch("assistant", { greeting: e.target.value })}
                maxLength={400}
                placeholder="{greeting}, thank you for calling {business}! I'm {assistant}, the AI assistant..."
              />
            </label>
            <div className="card" aria-live="polite">
              <strong>Callers will hear:</strong> &quot;{greetingPreview}&quot;
            </div>
            <label>
              Anything else the assistant should know <small className="muted">(products, landmarks, what NOT to promise)</small>
              <textarea value={data.assistant.extraKnowledge} onChange={(e) => patch("assistant", { extraKnowledge: e.target.value })} maxLength={4000} />
            </label>
          </div>
        ) : null}

        {step === 7 ? (
          <div>
            <p className="muted">
              Paste each Fygaro / WiPay payment link and put placeholders where the amount and reference go: <code>{"{amount}"}</code>,{" "}
              <code>{"{reference}"}</code>, <code>{"{name}"}</code>. Card details never touch Conroy. Optional: you can add these later.
            </p>
            {data.payments.map((p, i) => (
              <div key={i} className="card">
                <div className="row">
                  <label>
                    Provider
                    <select value={p.provider} onChange={(e) => setRow("payments", i, { provider: e.target.value as "FYGARO" | "WIPAY" })}>
                      <option value="FYGARO">Fygaro</option>
                      <option value="WIPAY">WiPay</option>
                    </select>
                  </label>
                  <label>
                    For
                    <select value={p.kind} onChange={(e) => setRow("payments", i, { kind: e.target.value as "DEPOSIT" | "FULL" | "INVOICE" })}>
                      <option value="DEPOSIT">Deposits</option>
                      <option value="FULL">Full payment</option>
                      <option value="INVOICE">Invoices</option>
                    </select>
                  </label>
                  <label style={{ flex: 1 }}>
                    Label
                    <input value={p.label} onChange={(e) => setRow("payments", i, { label: e.target.value })} placeholder="Booking deposit" {...invalid(`payments.${i}.label`)} />
                  </label>
                  <label style={{ width: 130 }}>
                    Default J$
                    <input inputMode="decimal" value={p.defaultAmount} onChange={(e) => setRow("payments", i, { defaultAmount: e.target.value })} placeholder="optional" />
                  </label>
                  <button type="button" className="small danger" onClick={() => removeRow("payments", i)}>
                    Remove
                  </button>
                </div>
                <label>
                  Link with placeholders
                  <input value={p.urlTemplate} onChange={(e) => setRow("payments", i, { urlTemplate: e.target.value })} placeholder="https://fygaro.com/en/pb/your-link/?amount={amount}&client_reference={reference}" {...invalid(`payments.${i}.urlTemplate`)} />
                  <ErrorText id={`e-payments.${i}.urlTemplate`} message={err(`payments.${i}.urlTemplate`) ?? err(`payments.${i}.label`)} />
                </label>
              </div>
            ))}
            <button type="button" className="secondary" onClick={() => addRow("payments", { provider: "FYGARO", kind: "DEPOSIT", label: "", urlTemplate: "", defaultAmount: "" })}>
              + Add payment link
            </button>
          </div>
        ) : null}

        {step === 8 ? (
          <div style={{ display: "grid", gap: "0.75rem", maxWidth: 680 }}>
            <fieldset style={{ border: 0, padding: 0 }}>
              <legend>
                <strong>Calendar</strong>
              </legend>
              {(
                [
                  ["INTERNAL", "Conroy's built-in calendar (staff use the dashboard)"],
                  ["GOOGLE", "Google Calendar (the owner shares their calendar with Conroy)"],
                  ["CALCOM", "Cal.com"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="check">
                  <input type="radio" name="calendar" checked={data.calendar.provider === value} onChange={() => patch("calendar", { provider: value })} />
                  {label}
                </label>
              ))}
            </fieldset>
            {data.calendar.provider === "GOOGLE" ? (
              <>
                <p className="muted" style={{ margin: 0 }}>
                  In Google Calendar: Settings &gt; the calendar &gt; Share with specific people &gt; add{" "}
                  <code>{googleServiceAccount ?? "the service account email (set GOOGLE_SERVICE_ACCOUNT_EMAIL)"}</code> with &quot;Make changes to
                  events&quot;.
                </p>
                <label>
                  Calendar ID <small className="muted">(usually the owner&apos;s Gmail address)</small>
                  <input value={data.calendar.googleCalendarId} onChange={(e) => patch("calendar", { googleCalendarId: e.target.value })} {...invalid("calendar.googleCalendarId")} />
                  <ErrorText id="e-calendar.googleCalendarId" message={err("calendar.googleCalendarId")} />
                </label>
              </>
            ) : null}
            {data.calendar.provider === "CALCOM" ? (
              <div className="row">
                <label style={{ flex: 2 }}>
                  Cal.com API key
                  <input type="password" autoComplete="off" value={data.calendar.calcomApiKey} onChange={(e) => patch("calendar", { calcomApiKey: e.target.value })} {...invalid("calendar.calcomApiKey")} />
                  <ErrorText id="e-calendar.calcomApiKey" message={err("calendar.calcomApiKey")} />
                </label>
                <label style={{ flex: 1 }}>
                  Event type ID
                  <input inputMode="numeric" value={data.calendar.calcomEventTypeId} onChange={(e) => patch("calendar", { calcomEventTypeId: e.target.value })} {...invalid("calendar.calcomEventTypeId")} />
                  <ErrorText id="e-calendar.calcomEventTypeId" message={err("calendar.calcomEventTypeId")} />
                </label>
              </div>
            ) : null}
            <fieldset style={{ border: 0, padding: 0 }}>
              <legend>
                <strong>Plan</strong>
              </legend>
              {plans.map((p) => (
                <label key={p.code} className="check">
                  <input type="radio" name="plan" checked={data.plan === p.code} onChange={() => setData((d) => ({ ...d, plan: p.code }))} />
                  {p.name}: {p.price}/month, {p.minutes} call minutes, {p.messages} WhatsApp messages included
                </label>
              ))}
            </fieldset>
          </div>
        ) : null}

        {step === 9 ? (
          <div>
            <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "0.3rem 1rem" }}>
              <dt>Business</dt>
              <dd>
                {data.business.name || <em>missing</em>} ({CATEGORY_LABELS[data.business.category]}), {[data.business.area, data.business.parish].filter(Boolean).join(", ")}
              </dd>
              <dt>Owner</dt>
              <dd>
                {data.owner.name || <em>missing</em>} &lt;{data.owner.email || "missing"}&gt;, WhatsApp {data.phones.ownerWhatsapp || <em>missing</em>}
              </dd>
              <dt>Open</dt>
              <dd>{h.filter((x) => !x.isClosed).map((x) => `${SHORT_DAYS[x.weekday]} ${x.openTime}-${x.closeTime}`).join(", ")}</dd>
              <dt>Team</dt>
              <dd>{data.staff.length ? data.staff.map((s) => s.name).join(", ") : "No staff (one appointment at a time)"}</dd>
              <dt>Services</dt>
              <dd>
                {data.services.length} {unpriced ? <span className="badge warn">{unpriced} without a price</span> : null}
              </dd>
              <dt>FAQs / policies</dt>
              <dd>
                {data.faqs.length} / {data.policies.length}
              </dd>
              <dt>Assistant</dt>
              <dd>
                {data.assistant.assistantName}, {data.assistant.tone === "LIGHT_PATOIS" ? "light Patois" : "Jamaican English"}
              </dd>
              <dt>Payment links</dt>
              <dd>{data.payments.length || "None yet"}</dd>
              <dt>Calendar / plan</dt>
              <dd>
                {data.calendar.provider.toLowerCase()} / {data.plan.toLowerCase()}
              </dd>
            </dl>
            <label className="check">
              <input type="checkbox" checked={data.options.goLive} onChange={(e) => patch("options", { goLive: e.target.checked })} />
              Go live now (otherwise the business is created in &quot;onboarding&quot; status: no reminders are sent until you activate it)
            </label>
            <label className="check">
              <input type="checkbox" checked={data.options.createVoiceAgent} onChange={(e) => patch("options", { createVoiceAgent: e.target.checked })} />
              Create the Retell voice agent now {retellReady ? "" : "(RETELL_API_KEY isn't set: this will be skipped)"}
            </label>
            <div className="row" style={{ marginTop: "1rem" }}>
              <button type="button" onClick={submit} disabled={submitting}>
                {submitting ? "Creating..." : "Create business"}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <div className="row spread">
        <button type="button" className="secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          &larr; Back
        </button>
        <button
          type="button"
          className="small secondary"
          onClick={() => {
            if (confirm("Clear the whole form and start again?")) {
              setData(initialData());
              setErrors({});
              setMessage(null);
              setStep(0);
            }
          }}
        >
          Start over
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={() => setStep((s) => s + 1)}>
            Next &rarr;
          </button>
        ) : (
          <span />
        )}
      </div>
      <p className="muted">Your answers are saved in this browser as you go, so you can come back to finish.</p>
    </div>
  );
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="small secondary"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function LaunchScreen({ launch }: { launch: LaunchResult }) {
  const platformTip: Record<string, string> = {
    WordPress: "WordPress: install WPCode (or Insert Headers and Footers) and paste it in the Footer box.",
    "Hostinger Website Builder": "Hostinger Website Builder: Settings > Integrations > custom code (footer), then publish.",
    Wix: "Wix: Settings > Custom code > Add custom code (Body - end, all pages).",
    Squarespace: "Squarespace: Settings > Advanced > Code injection > Footer.",
    Shopify: "Shopify: Online Store > Themes > Edit code > theme.liquid, just before </body>.",
    "Plain HTML": "Plain HTML: paste just before </body> on every page.",
  };
  return (
    <div>
      <div className="flash ok" role="status">
        {launch.name} is set up{launch.status === "ONBOARDING" ? " (status: onboarding, not live yet)" : " and live"}.
      </div>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>1. Owner login (shown once)</h2>
        <p>
          Email: <strong>{launch.ownerEmail}</strong>
          <br />
          Temporary password: <code style={{ fontSize: "1.1rem" }}>{launch.tempPassword}</code> <Copy text={launch.tempPassword} />
        </p>
        <p className="muted">Send it to the owner by WhatsApp. They&apos;ll choose their own password the first time they sign in.</p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>2. Website widget</h2>
        <pre className="code">{launch.widgetSnippet}</pre>
        <Copy text={launch.widgetSnippet} />
        <p className="muted">{platformTip[launch.websitePlatform ?? ""] ?? "Paste it on every page, just before </body>."}</p>
        <p>
          Try it now: <a href={launch.demoUrl} target="_blank" rel="noreferrer">{launch.demoUrl}</a>
        </p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>3. Phone</h2>
        <p>
          <span className={`badge ${launch.voice.status === "created" ? "ok" : launch.voice.status === "failed" ? "danger" : "warn"}`}>
            voice agent {launch.voice.status}
          </span>{" "}
          {launch.voice.message}
        </p>
        <p>
          {launch.voiceNumber
            ? `Conroy's number: ${launch.voiceNumber}. Connect it to the agent from the business page if you haven't yet.`
            : "No 876 number yet: buy one on Twilio or Telnyx, then connect it from the business page."}
        </p>
        <h3>Call forwarding from the owner&apos;s Digicel / Flow mobile</h3>
        <div className="table-wrap">
          <table>
            <tbody>
              {launch.forwarding.map((f) => (
                <tr key={f.code}>
                  <td>{f.what}</td>
                  <td>
                    <code>{f.code}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted">Dial the code and press call on the business phone. Confirm the codes with Digicel/Flow; landlines use the carrier&apos;s own forwarding service.</p>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>4. Still to do</h2>
        <ul>
          <li>WhatsApp: register the business number in Meta (or 360dialog), then add its phone number ID on the business page and send a test message.</li>
          {launch.calendarProvider === "GOOGLE" ? (
            <li>
              Google Calendar: the owner shares their calendar with <code>{launch.googleServiceAccount ?? "the service account"}</code> (&quot;Make changes to
              events&quot;); then press &quot;Test calendar&quot; on the business page.
            </li>
          ) : null}
          {launch.calendarProvider === "CALCOM" ? <li>Cal.com: press &quot;Test calendar&quot; on the business page.</li> : null}
          <li>Give the owner the privacy notice link for their website: {launch.privacyUrl}</li>
          <li>Test: call the number, send a WhatsApp, and book from the demo page.</li>
        </ul>
        <div className="row">
          <Link className="button" href={`/admin/businesses/${launch.businessId}`}>
            Open the business page
          </Link>
          <Link className="button secondary" href="/admin">
            All businesses
          </Link>
        </div>
      </section>
    </div>
  );
}
