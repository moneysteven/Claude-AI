/**
 * Lightweight intent detection for Jamaican English and Patois (Jamaican
 * Creole). It is used for:
 *  - hard rules that must never depend on an LLM (STOP, "talk to a person",
 *    medical emergencies),
 *  - the no-LLM "rules" chat engine (demo / fallback when the LLM is down),
 *  - analytics on what people ask about.
 * The LLM gets the PATOIS_GUIDE below so it understands the same phrases.
 */

export type Intent =
  | "URGENT_MEDICAL"
  | "OPT_OUT"
  | "OPT_IN"
  | "HUMAN"
  | "COMPLAINT"
  | "POLICY"
  | "CANCEL"
  | "RESCHEDULE"
  | "BOOK"
  | "AVAILABILITY"
  | "PRICE"
  | "PAYMENT"
  | "HOURS"
  | "LOCATION"
  | "SERVICES"
  | "THANKS"
  | "CONFIRM"
  | "DENY"
  | "GREETING"
  | "UNKNOWN";

/** Patois/Jamaican English word -> plain English, applied word by word. */
const LEXICON: Record<string, string> = {
  unnu: "you",
  unu: "you",
  yuh: "you",
  yu: "you",
  yah: "here",
  mi: "me",
  fi: "for",
  waan: "want",
  wa: "want",
  wah: "what",
  wat: "what",
  weh: "where",
  wey: "where",
  deh: "there",
  dere: "there",
  nuh: "not",
  nah: "no",
  cyaan: "cannot",
  kyaan: "cannot",
  caan: "cannot",
  seh: "say",
  di: "the",
  de: "the",
  dem: "them",
  dis: "this",
  dat: "that",
  tideh: "today",
  tiday: "today",
  tumaro: "tomorrow",
  tumawra: "tomorrow",
  likkle: "little",
  pickney: "child",
  pickeny: "child",
  haffi: "have to",
  affi: "have to",
  mek: "make",
  tek: "take",
  pon: "on",
  inna: "in",
  bout: "about",
  ting: "thing",
  anyting: "anything",
  sumting: "something",
  smaddy: "somebody",
  sombady: "somebody",
  tanks: "thanks",
  tank: "thank",
  gwaan: "going on",
  whaa: "what",
  fren: "friend",
  ooman: "woman",
  bredda: "brother",
  sistren: "sister",
  bredren: "friend",
  lef: "leave",
  gimme: "give me",
  lemme: "let me",
  wid: "with",
  nuff: "plenty",
  cah: "because",
  kinda: "kind of",
};

/** Text for the LLM system prompt so voice and chat understand the same Patois. */
export const PATOIS_GUIDE = `Common Jamaican Patois you will hear (understand it, reply in clear Jamaican English):
- "wah gwaan" / "wagwan" = hello, what's up
- "unnu" / "unu" = you (plural, the business); "yuh" = you; "mi" = I / me / my
- "fi" = for / to ("how much fi a trim?" = how much for a trim?)
- "mi waan" = I want; "mi cyaan" = I can't; "mi haffi" = I have to
- "weh" = where / what ("a weh unnu deh?" = where are you located?)
- "deh" = there / is located; "nuh" = don't / not; "tideh" = today; "tumaro" = tomorrow
- "yuh have space?" / "unnu can fit mi in?" = do you have an available appointment?
- "pon" = on ("pon Saturday"); "tek" = take ("unnu tek card?" = do you accept cards?)
- "likkle" = little; "pickney" = child; "soon come" = I'll be there shortly (may be late)
- "big up" / "bless up" / "respect" = thanks; "yes man" / "yeah mon" = yes; "no sah" = no`;

export function normalizeForIntent(text: string): string {
  const lowered = text
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[^a-z0-9'$\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return lowered
    .split(" ")
    .map((w) => LEXICON[w] ?? w)
    .join(" ");
}

interface Rule {
  intent: Intent;
  patterns: RegExp[];
}

// Ordered by priority: the first matching rule wins as the primary intent.
const RULES: Rule[] = [
  {
    intent: "URGENT_MEDICAL",
    patterns: [
      /chest (is )?(a )?(hurt|pain)/,
      /chest pain/,
      /(cannot|can't|cant) breathe?/,
      /not breathing/,
      /heart attack/,
      /stroke/,
      /seizure/,
      /unconscious|passed out|faint(ed|ing)\b/,
      /bleeding (bad|heavy|a lot|plenty|won't stop|nah stop|not stop)/,
      /overdose/,
      /suicid|kill (my ?self|me self)|end my life/,
      /allergic reaction|throat (is )?(swell|closing)/,
      /severe pain|pain (bad bad|real bad)/,
    ],
  },
  {
    intent: "OPT_OUT",
    patterns: [/^stop$/, /^stop (all|now|please)$/, /^unsubscribe$/, /stop (send|sending|messag|text)/, /unsubscribe/, /^opt ?out$/, /don't (message|text) me/],
  },
  { intent: "OPT_IN", patterns: [/^start$/, /^subscribe$/, /^opt ?in$/, /^unstop$/] },
  {
    intent: "HUMAN",
    patterns: [
      /\b(talk|speak|chat) (to|with) (a |an |the )?(real |live )?(person|somebody|someone|human|staff|owner|manager|agent|representative|tasha|stylist|receptionist|smaddy)/,
      /\b(real|live|actual) (person|human|somebody|someone)/,
      /\bput me (through|on)\b/,
      /\btransfer me\b/,
      /\b(human|agent|representative|operator)\b/,
      /talk to a person/,
      /call me back/,
    ],
  },
  {
    intent: "COMPLAINT",
    patterns: [
      /not right/,
      /\b(vex|vexed|upset|angry|annoyed|frustrated|disappointed|disgusted)\b/,
      /\bcomplain(t)?\b/,
      /\b(rude|terrible|worst|horrible|awful|unacceptable|ridiculous|scam)\b/,
      /nobody (not )?(there|here|answer)/,
      /waste (of )?(me |my )?time/,
      /want (me |my )?money back/,
    ],
  },
  {
    intent: "POLICY",
    patterns: [/\bpolic(y|ies)\b/, /\brefund(able)?\b/, /\bif (i|me) (am |is )?late\b/, /\blate fee\b/, /\brules?\b/, /\bno show\b/],
  },
  {
    intent: "CANCEL",
    patterns: [/\bcancel(?!lation)/, /\bcall (it )?off\b/, /\b(not|cannot|can't) (come|make it|reach) (at all|again)\b/, /\bdon't (want|need) (the |my |me )?appointment\b/],
  },
  {
    intent: "RESCHEDULE",
    patterns: [
      /\breschedul/,
      /\b(move|change|shift|push|switch) (the |my |me )?(appointment|booking|time|date|day)\b/,
      /\b(move|push) it\b/,
      /\banother (day|time)\b/,
      /\bdifferent (day|time)\b/,
      /\b(cannot|can't) (come|make it|reach)\b/,
    ],
  },
  {
    intent: "BOOK",
    patterns: [
      /\bbook(ing)?\b/,
      /\bappointment\b/,
      /\breserv(e|ation)\b/,
      /\bschedule\b/,
      /\bset (up )?a time\b/,
      /\bwant (a|to get|to do|to come)\b/,
      /\bcome in (for|on)\b/,
    ],
  },
  {
    intent: "AVAILABILITY",
    patterns: [
      /\bspace\b/,
      /\bavailab(le|ility)\b/,
      /\bfit (me|us) in\b/,
      /\bany ?thing (for|on)\b/,
      /\bany (slot|opening|time|space)s?\b/,
      /\bslots?\b/,
      /\bfree (time|slot)\b/,
      /\bhow (soon|early)\b/,
    ],
  },
  { intent: "PRICE", patterns: [/\bhow much\b/, /\bprice(s)?\b/, /\bcost(s)?\b/, /\bcharge\b/, /\brates?\b/, /\bfee\b/, /\bwhat it run\b/] },
  {
    intent: "PAYMENT",
    patterns: [
      /\bpay(ment|ing)?\b/,
      /\bcard\b/,
      /\bcash\b/,
      /\b(bank )?transfer\b/,
      /\bdeposit\b/,
      /\bsend (the|me) money\b/,
      /\bmoney\b/,
      /\bfygaro\b/,
      /\bwipay\b/,
      /\bpayment link\b/,
    ],
  },
  {
    intent: "HOURS",
    patterns: [/\bopen\b/, /\bclose(d|s)?\b/, /\bclosing\b/, /\bopening\b/, /\bhours\b/, /\bwhat time\b/, /\btime you\b/],
  },
  {
    intent: "LOCATION",
    patterns: [
      /\bwhere\b/,
      /\blocat(e|ed|ion)\b/,
      /\baddress\b/,
      /\bdirection(s)?\b/,
      /\bget (there|to you)\b/,
      /\bfind you\b/,
      /\bparking\b/,
      /\bplaza\b/,
    ],
  },
  {
    intent: "SERVICES",
    patterns: [
      /\bservices?\b/,
      /\bwhat kind of\b/,
      /\b(you|do you) (do|offer)\b/,
      /\bmenu\b/,
      /\boffer\b/,
      /\bbraid(s|ing)?\b/,
      /\b(manicure|pedicure|nails?|relaxer|silk press|trim|haircut|cut|colou?r|wash)\b/,
    ],
  },
  {
    intent: "THANKS",
    patterns: [/\bthank(s| you)?\b/, /\bthanx\b/, /\bbig up\b/, /\bbless up\b/, /\brespect\b/, /\bappreciate\b/, /\bmuch love\b/],
  },
  {
    intent: "CONFIRM",
    patterns: [/^(yes|yeah|yea|yep|yup|ya|yah|ye|sure|ok|okay|alright|correct|confirm(ed)?)\b/, /^(yes|yeah) (man|mon)\b/, /^that (right|fine|good)\b/, /^a so\b/],
  },
  { intent: "DENY", patterns: [/^(no|nope|nah)\b/, /^no (sah|man|mon|thanks)\b/, /^not (really|now)\b/] },
  {
    intent: "GREETING",
    patterns: [/^(hi|hello|hey|hiya|yo|yow|wagwan|whaap|greetings)\b/, /\bgood (morning|afternoon|evening|day|night)\b/, /\bwhat going on\b/, /\bwh?ah? ?gw[a]+n\b/, /^morning\b/, /^evening\b/],
  },
];

export interface IntentResult {
  intent: Intent;
  /** Every intent that matched, in priority order. */
  matched: Intent[];
  normalized: string;
}

export function detectIntent(text: string): IntentResult {
  const normalized = normalizeForIntent(text);
  const raw = text.toLowerCase();
  const matched: Intent[] = [];
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(normalized) || p.test(raw))) matched.push(rule.intent);
  }
  // A greeting followed by a real question: the question wins (already by priority).
  return { intent: matched[0] ?? "UNKNOWN", matched, normalized };
}

/** Exact keywords that switch the WhatsApp bot off for a conversation. */
export function isHumanHandoffKeyword(text: string): boolean {
  return detectIntent(text).matched.includes("HUMAN");
}

export function isOptOut(text: string): boolean {
  return detectIntent(text).intent === "OPT_OUT";
}

export function isOptIn(text: string): boolean {
  return detectIntent(text).intent === "OPT_IN";
}
