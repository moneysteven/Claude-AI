# Data processing agreement (template): Client business ↔ Steven Scale Solutions

> **IMPORTANT: have a Jamaican attorney review this before anyone signs it.** It is a starting template written by a non-lawyer for the Conroy AI receptionist service. It reflects the Jamaica Data Protection Act, 2020 (JDPA) as understood in November 2026. It is not legal advice. Section references, defined terms, the breach-notification provisions and the international-transfer wording must be checked against the Act, the Data Protection Regulations 2024 and current guidance from the Office of the Information Commissioner (OIC).
>
> Use it as a schedule to your service agreement with each client, or as a separate agreement. Replace every `[PLACEHOLDER]`.

---

**Data Processing Agreement**

Between:
- **[CLIENT LEGAL NAME]**, [address], Jamaica (the **"Controller"**); and
- **Steven Scale Solutions** [legal form, registration number], [address], Jamaica (the **"Processor"**).

Dated: [DATE]. This Agreement forms part of the [Service Agreement / Order] dated [DATE] (the **"Service Agreement"**) for the Conroy AI receptionist service (the **"Service"**).

## 1. Definitions

"Personal data", "processing", "data controller", "data processor", "data subject" and "Commissioner" have the meanings given in the Data Protection Act, 2020 of Jamaica (the **"Act"**). "Security breach" means a breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to, personal data processed under this Agreement. [Attorney: align with the Act's definition.]

## 2. Roles

2.1 The Controller decides why and how personal data is processed in the Service and is the data controller.
2.2 The Processor processes personal data only on the Controller's behalf, as data processor, to provide the Service.

## 3. Subject matter, nature, purpose and duration

| Item | Details |
|---|---|
| Subject matter | Operating an AI receptionist for the Controller: answering calls, WhatsApp and website chat; booking, rescheduling and cancelling appointments; taking messages; sending confirmations, reminders and payment links; providing the Controller's dashboard |
| Nature of processing | Collection, recording, transcription, storage, organisation, retrieval, use, transmission to sub-processors, and deletion |
| Purpose | Providing the Service under the Service Agreement |
| Duration | The term of the Service Agreement, plus the deletion period in clause 10 |

## 4. Personal data and data subjects

| Data subjects | Categories of personal data |
|---|---|
| The Controller's customers and enquirers (callers, WhatsApp and website chat users) | Name, phone/WhatsApp number, enquiry and booking details, call recordings, call transcripts and summaries, chat/WhatsApp message content, payment request records (amount, reference, status; **no card data**), WhatsApp opt-out status, website chat token, IP address (security) |
| The Controller's staff and users of the dashboard | Name, email, role, login and audit records, staff names and working schedules used for bookings |

**Special categories**: the Service is not designed to collect sensitive personal data. The assistant tells people not to share medical or financial details. For clinics, the Controller must not configure the Service to collect health information beyond what is needed to book an appointment. [Attorney: review for clinic clients.]

## 5. Processor obligations

The Processor shall:

5.1 **Instructions.** Process personal data only on the Controller's documented instructions. These consist of this Agreement, the Service Agreement and the Controller's configuration of the Service, unless the law requires otherwise. In that case the Processor will tell the Controller first, unless the law forbids it. The Processor will tell the Controller if it believes an instruction breaks the Act.

5.2 **Confidentiality.** Make sure everyone authorised to process the personal data is bound by confidentiality, and only give access to those who need it to provide or support the Service.

5.3 **Security.** Keep appropriate technical and organisational measures in place, including as a minimum the measures the Service has at the date of this Agreement:
- (a) encryption in transit (HTTPS/TLS) for the dashboard, website widget and provider webhooks;
- (b) encryption at rest (AES-256-GCM) of call transcripts, call summaries, call recording links, chat and WhatsApp message content, and stored provider credentials;
- (c) separation of the Controller's data from other clients' data in the application, with automated tests checking that one client cannot read or change another's data;
- (d) role-based access to the dashboard (owner, manager, staff), hashed passwords, one-time temporary passwords that must be changed, rate-limited sign-in, and an audit log of administrative actions;
- (e) verification of webhook signatures from the voice, WhatsApp and telephony providers, and input validation;
- (f) automatic deletion of recordings, transcripts and message content after the retention period set by the Controller (default 90 days), and automatic removal of a data subject's contact details, enquiries and chats, and of their name and number on booking and payment records, after a second period without contact from them set by the Controller (default 24 months);
- (g) daily backups of the database, stored on the server with access limited to its administrator and kept for [14] days (`BACKUP_KEEP_DAYS`), with a written restore procedure;
- (h) logging that excludes secrets and message content;
- (i) monitoring and error alerts.

5.4 **Sub-processors.** Use only the sub-processors in clause 6, and follow clause 6 for changes.

5.5 **Data subject requests.** Help the Controller answer data subjects who exercise their rights under the Act. The Service includes tools in the Controller's dashboard ("Privacy requests") to **export** all data held for a phone number and to **erase** it, including the voice sub-processor's copies of that person's calls. Bookings and paid payment records are kept in anonymised form, and the Processor will help with requests the tools don't cover. The Processor will pass on any request it receives directly, without answering it, unless the Controller authorises it to.

5.6 **Security breaches.** Notify the Controller **without undue delay, and in any event within [24] hours** of becoming aware of a security breach affecting the Controller's personal data. The notice will describe:
- the nature of the breach;
- the categories and approximate numbers of data subjects and records involved;
- the likely consequences;
- the measures taken or proposed.

This is so the Controller can meet its own obligation to notify the Commissioner (reported as **within 72 hours** under the Act) and, where required, the affected data subjects. [Attorney: confirm the statutory deadline and section.] The Processor will cooperate with the Controller's investigation and remediation.

5.7 **Assistance.** Give reasonable help with the Controller's data protection impact assessments, consultations with the Commissioner and security obligations, as far as they relate to the Service.

5.8 **Records.** Keep records of the processing it carries out for the Controller.

## 6. Sub-processors

6.1 The Controller authorises the Processor to use these sub-processors (names, roles and locations as at the date of this Agreement):

| Sub-processor | Role | Main processing location |
|---|---|---|
| Retell AI | Voice assistant: speech recognition, voice, call recording and transcription | [United States — confirm] |
| [Telnyx / Twilio] | Phone number and call routing | [United States — confirm] |
| [Meta Platforms / 360dialog] | WhatsApp messaging | [confirm] |
| [Anthropic / other LLM provider] | AI model for chat replies | [United States — confirm] |
| [Google / Cal.com] (if the Controller uses them) | Appointment calendar | [confirm] |
| Hostinger | Server hosting and database | [data centre location of the chosen VPS] |
| [Email provider] | Account and alert emails | [confirm] |

Payment providers (**Fygaro, WiPay**) are engaged by the Controller directly. Card data is entered only on their pages and never reaches the Service.

6.2 The Processor will give the Controller at least [30] days' written notice (email is enough) before adding or replacing a sub-processor. The Controller may object on reasonable data-protection grounds within that period. The parties will then discuss in good faith. If they can't resolve it, the Controller may end the affected part of the Service without penalty.

6.3 The Processor will put data protection terms in place with each sub-processor that are at least as protective as this Agreement, as far as the sub-processor's standard terms allow. The Processor remains responsible to the Controller for its sub-processors' performance. [Attorney: many of these providers only offer standard terms; adjust.]

## 7. International transfers

Some sub-processors process personal data outside Jamaica. The Processor will transfer personal data outside Jamaica only:
- as necessary to provide the Service through the sub-processors in clause 6; and
- [with the safeguards required by the Act — attorney to specify].

The Controller acknowledges these transfers.

## 8. Controller responsibilities

The Controller shall:
- (a) have a lawful basis for the processing and give data subjects the required information. This includes publishing a privacy notice (a template is provided in `legal/PRIVACY_NOTICE_TEMPLATE.md`) and keeping the AI and recording disclosures switched on;
- (b) **register with the Office of the Information Commissioner as a data controller**, if required, and keep the registration current. Note: the OIC registration portal was reported paused from December 2025 and still offline in 2026, and the OIC said it would not penalise failure to register while the portal is down; check the current status at https://oic.gov.jm;
- (c) set retention periods suitable for its business, for recordings and messages and for customer details (dashboard → Settings → Business & assistant);
- (d) keep its dashboard accounts secure, and remove access for staff who leave (dashboard → Team);
- (e) give only lawful instructions, and enter accurate information (prices, policies, FAQs) for the assistant to use;
- (f) respond to data subject requests, using the Service's tools.

## 9. Audits

On reasonable notice (at least [30] days), and no more than once a year unless a security breach has occurred or the Commissioner requires it, the Processor will give the Controller the information reasonably needed to show compliance with this Agreement. This includes a written description of security measures and answers to a reasonable questionnaire. On-site or third-party audits are at the Controller's cost, by agreement on scope, timing and confidentiality.

## 10. End of the Service: return and deletion

10.1 When the Service Agreement ends, at the Controller's choice the Processor will:
- (a) give the Controller a complete export of its data in a common machine-readable format (JSON) within [30] days of a written request made within [30] days after termination; and/or
- (b) delete the Controller's data from the live system within [60] days after termination. Deletion covers all of the Controller's records in the Service and the voice sub-processor's copies of its calls, its voice agent and its number connection.

10.2 Database backups containing the data are overwritten as they roll off, within [14] days (`BACKUP_KEEP_DAYS`) of deletion from the live system. Messages already delivered through WhatsApp remain with Meta and on the data subjects' and Controller's devices under WhatsApp's own terms. The Processor keeps one record that the deletion took place (date, the Controller's name, record counts and usage totals for final billing), without personal data of data subjects.

10.3 The Processor will confirm deletion in writing on request. The Processor may keep data only where the law requires, and then only for as long as required, protected under this Agreement.

## 11. Liability

[Attorney: liability caps, indemnities and the relationship with the Service Agreement's limitation of liability. Placeholder: each party's liability under this Agreement is subject to the limitations in the Service Agreement, except where the law does not allow liability to be limited.]

## 12. General

12.1 If this Agreement conflicts with the Service Agreement on data protection, this Agreement prevails.
12.2 This Agreement is governed by the laws of Jamaica, and the courts of Jamaica have exclusive jurisdiction.
12.3 Changes must be in writing and signed by both parties.

**Signed for the Controller:** ______________________ Name: [ ] Title: [ ] Date: [ ]

**Signed for the Processor (Steven Scale Solutions):** ______________________ Name: [ ] Title: [ ] Date: [ ]
