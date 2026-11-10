import type { Service } from "@prisma/client";
import type { Metadata } from "next";
import { Flash } from "@/components/Flash";
import { requireTenant, SETTINGS_ROLES } from "@/lib/auth/session";
import { usdRate } from "@/lib/business";
import { formatJmd, priceLabel } from "@/lib/money";
import { centsToInput } from "../_lib";
import { deleteServiceAction, saveServiceAction } from "./actions";

export const metadata: Metadata = { title: "Services" };

function ServiceForm({ service, nextSort }: { service?: Service; nextSort: number }) {
  return (
    <form action={saveServiceAction} className="stack">
      {service ? <input type="hidden" name="id" value={service.id} /> : null}
      <label>
        Name
        <input name="name" defaultValue={service?.name ?? ""} required maxLength={100} placeholder="Silk Press" />
      </label>
      <label>
        Description (optional)
        <input name="description" defaultValue={service?.description ?? ""} maxLength={500} />
      </label>
      <div className="row">
        <label>
          Duration (minutes)
          <input name="durationMin" type="number" min={5} max={720} defaultValue={service?.durationMin ?? 60} required />
        </label>
        <label>
          Clean-up buffer (minutes)
          <input name="bufferMin" type="number" min={0} max={240} defaultValue={service?.bufferMin ?? 0} required />
        </label>
        <label>
          Sort order
          <input name="sortOrder" type="number" min={0} max={1000} defaultValue={service?.sortOrder ?? nextSort} required />
        </label>
      </div>
      <div className="row">
        <label>
          Price J$ <small className="muted">(blank = price on consultation)</small>
          <input name="price" inputMode="decimal" defaultValue={centsToInput(service?.priceCents)} placeholder="4500" maxLength={30} />
        </label>
        <label>
          Deposit J$ <small className="muted">(optional)</small>
          <input name="deposit" inputMode="decimal" defaultValue={centsToInput(service?.depositCents)} placeholder="5000" maxLength={30} />
        </label>
      </div>
      <div className="row">
        <label className="check">
          <input type="checkbox" name="priceIsFrom" defaultChecked={service?.priceIsFrom ?? false} /> &quot;From&quot; price
        </label>
        <label className="check">
          <input type="checkbox" name="bookable" defaultChecked={service?.bookable ?? true} /> Bookable by the assistant
        </label>
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={service?.active ?? true} /> Active
        </label>
      </div>
      <div>
        <button type="submit">{service ? "Save service" : "Add service"}</button>
      </div>
    </form>
  );
}

export default async function ServicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const { business, t } = await requireTenant(SETTINGS_ROLES);
  const services = await t.service.findMany({
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    include: { staff: { include: { staff: { select: { name: true } } } }, _count: { select: { bookings: true } } },
  });
  const rate = usdRate(business);
  const nextSort = services.reduce((m, s) => Math.max(m, s.sortOrder), -1) + 1;

  return (
    <>
      <h1>Services</h1>
      <Flash searchParams={sp} />
      <p className="muted">
        Prices are in Jamaican dollars. The assistant only quotes prices listed here and never invents one. Choose who performs each service on the
        Staff page.
      </p>

      {services.length === 0 ? <p className="muted">No services yet.</p> : null}
      {services.map((s) => (
        <details key={s.id} className="card">
          <summary className="row spread">
            <span>
              <strong>{s.name}</strong> - {priceLabel(s.priceCents, { isFrom: s.priceIsFrom, usdRate: rate })}, {s.durationMin} min
              {s.depositCents ? `, deposit ${formatJmd(s.depositCents)}` : ""}
            </span>
            <span className="row">
              {!s.active ? <span className="badge danger">inactive</span> : null}
              {s.active && !s.bookable ? <span className="badge warn">not bookable</span> : null}
              <small className="muted">
                {s.staff.length ? s.staff.map((l) => l.staff.name).join(", ") : "any staff"} - {s._count.bookings} booking(s)
              </small>
            </span>
          </summary>
          <ServiceForm service={s} nextSort={nextSort} />
          <form action={deleteServiceAction} className="inline" style={{ marginTop: "0.75rem" }}>
            <input type="hidden" name="id" value={s.id} />
            <button className="small danger">{s._count.bookings > 0 ? "Switch off" : "Delete"}</button>
          </form>
        </details>
      ))}

      <section className="card">
        <h2>Add a service</h2>
        <ServiceForm nextSort={nextSort} />
      </section>
    </>
  );
}
