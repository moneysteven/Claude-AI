/**
 * Call-forwarding codes for businesses that keep their existing Digicel /
 * Flow mobile number and forward calls to their Conroy 876 number.
 * Standard GSM MMI codes; confirm with the carrier. Browser-safe.
 */
export interface ForwardingCode {
  what: string;
  code: string;
}

export function forwardingCodes(voiceNumberE164: string | null | undefined): ForwardingCode[] {
  const digits = voiceNumberE164 ? voiceNumberE164.replace(/\D/g, "") : "1876XXXXXXX";
  return [
    { what: "Forward when you don't answer", code: `**61*${digits}#` },
    { what: "Forward when you don't answer, after about 20 seconds", code: `**61*${digits}**20#` },
    { what: "Forward when your line is busy", code: `**67*${digits}#` },
    { what: "Forward ALL calls (after hours / shop closed)", code: `**21*${digits}#` },
    { what: "Stop forwarding unanswered calls", code: "##61#" },
    { what: "Stop forwarding busy calls", code: "##67#" },
    { what: "Stop forwarding all calls", code: "##21#" },
    { what: "Cancel every kind of forwarding", code: "##002#" },
    { what: "Check unanswered-call forwarding", code: "*#61#" },
  ];
}
