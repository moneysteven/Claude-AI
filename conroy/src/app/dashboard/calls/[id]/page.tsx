import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/auth/session";
import { decryptOptional } from "@/lib/crypto";
import { formatPhone } from "@/lib/phone";
import { formatDateTimeShort, formatDateTimeSpoken } from "@/lib/time";

export const metadata: Metadata = { title: "Call" };

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { business, t } = await requireTenant();
  const call = await t.callLog.findFirst({ where: { id }, include: { contact: true } });
  if (!call) notFound();
  const [booking, lead] = await Promise.all([
    call.bookingId ? t.booking.findFirst({ where: { id: call.bookingId }, include: { service: true, staff: true } }) : null,
    call.leadId ? t.lead.findFirst({ where: { id: call.leadId } }) : null,
  ]);
  const tz = business.timezone;
  const transcript = decryptOptional(call.transcriptEnc);
  const summary = decryptOptional(call.summaryEnc);
  const recording = decryptOptional(call.recordingUrlEnc);
  const safeRecording = recording && /^https:\/\//.test(recording) ? recording : null;

  return (
    <>
      <p>
        <Link href="/dashboard/calls">&larr; Calls</Link>
      </p>
      <h1>
        Call from {call.contact?.name ?? (call.fromNumber ? formatPhone(call.fromNumber) : "hidden number")}
      </h1>
      <div className="card">
        <div>
          <strong>When:</strong> {call.startedAt ? formatDateTimeShort(call.startedAt, tz) : "-"}
          {call.afterHours ? <span className="badge warn" style={{ marginLeft: 6 }}>after hours</span> : null}
        </div>
        <div>
          <strong>Caller:</strong> {call.fromNumber ? formatPhone(call.fromNumber) : "hidden"}
        </div>
        <div>
          <strong>Length:</strong> {Math.floor(call.durationSec / 60)} min {call.durationSec % 60} s
        </div>
        <div>
          <strong>Outcome:</strong> {call.outcome ? call.outcome.toLowerCase().replace(/_/g, " ") : "in progress"}
          {call.transferred ? " (transferred to staff)" : ""}
        </div>
        {call.reason ? (
          <div>
            <strong>Reason:</strong> {call.reason}
          </div>
        ) : null}
        {call.sentiment ? (
          <div>
            <strong>Caller mood:</strong> {call.sentiment}
          </div>
        ) : null}
        {booking ? (
          <div>
            <strong>Booking:</strong> {booking.service.name} {booking.staff ? `with ${booking.staff.name}` : ""} on{" "}
            {formatDateTimeSpoken(booking.startAt, tz)} (ref {booking.reference}, {booking.status.toLowerCase()})
          </div>
        ) : null}
        {lead ? (
          <div>
            <strong>Message taken:</strong> {lead.request} <Link href="/dashboard/leads">(leads)</Link>
          </div>
        ) : null}
        <div>
          <strong>Owner summary sent:</strong> {call.ownerNotifiedAt ? formatDateTimeShort(call.ownerNotifiedAt, tz) : "not yet"}
        </div>
      </div>

      {call.purgedAt ? (
        <p className="muted">Transcript and recording were deleted on {formatDateTimeShort(call.purgedAt, tz)} under the retention policy.</p>
      ) : null}
      {summary ? (
        <>
          <h2>Summary</h2>
          <p>{summary}</p>
        </>
      ) : null}
      {safeRecording ? (
        <>
          <h2>Recording</h2>
          <audio controls preload="none" src={safeRecording} style={{ width: "100%" }}>
            <a href={safeRecording}>Download recording</a>
          </audio>
        </>
      ) : null}
      {transcript ? (
        <>
          <h2>Transcript</h2>
          <pre className="transcript">{transcript}</pre>
        </>
      ) : null}
    </>
  );
}
