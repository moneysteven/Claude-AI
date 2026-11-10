import { Prisma } from "@prisma/client";
import { db } from "./db";

/**
 * Tenant isolation. `tenantDb(businessId)` returns a Prisma client that
 * automatically adds `businessId` to every read, update, delete and create on
 * tenant-owned models, so a bug in a route cannot leak another business's data.
 * Dashboard pages, assistant tools and public endpoints all go through it.
 */

const TENANT_MODELS = new Set<string>(
  Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.name === "businessId") && m.name !== "User" && m.name !== "AuditLog")
    .map((m) => m.name),
);

const WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "upsert",
]);

export class TenantViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantViolationError";
  }
}

export function tenantDb(businessId: string) {
  if (!businessId) throw new TenantViolationError("tenantDb requires a businessId");
  return db.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (model === "Business") {
            // The business itself: only its own row.
            if (operation === "create" || operation === "createMany" || operation === "deleteMany") {
              throw new TenantViolationError(`Business.${operation} is not allowed through tenantDb`);
            }
            if (WHERE_OPS.has(operation)) {
              const a = args as { where?: Record<string, unknown> };
              a.where = scopeWhere(a.where, { id: businessId });
            }
            return query(args);
          }
          if (!model || !TENANT_MODELS.has(model)) return query(args);

          const a = args as Record<string, unknown> & {
            where?: Record<string, unknown>;
            data?: unknown;
            create?: Record<string, unknown>;
          };
          if (WHERE_OPS.has(operation)) {
            a.where = scopeWhere(a.where, { businessId });
          }
          if (operation === "create") {
            a.data = withBusiness(a.data, businessId);
          }
          if (operation === "createMany" || operation === "createManyAndReturn") {
            const data = a.data;
            a.data = Array.isArray(data) ? data.map((d) => withBusiness(d, businessId)) : withBusiness(data, businessId);
          }
          if (operation === "upsert" && a.create) {
            a.create = withBusiness(a.create, businessId) as Record<string, unknown>;
          }
          if ((operation === "update" || operation === "updateMany" || operation === "upsert") && a.data) {
            const d = a.data as Record<string, unknown>;
            if ("businessId" in d && d.businessId !== businessId) {
              throw new TenantViolationError("Cannot move a record to another business");
            }
          }
          return query(args);
        },
      },
    },
  });
}

/**
 * AND the tenant scope onto the caller's filter (never overwrite it): asking
 * for another business's id must find nothing, not silently find your own row.
 */
function scopeWhere(where: Record<string, unknown> | undefined, scope: Record<string, unknown>): Record<string, unknown> {
  const w = { ...(where ?? {}) };
  const existing = w.AND === undefined ? [] : Array.isArray(w.AND) ? w.AND : [w.AND];
  w.AND = [...existing, scope];
  return w;
}

function withBusiness(data: unknown, businessId: string): unknown {
  if (!data || typeof data !== "object") return data;
  const d = data as Record<string, unknown>;
  if (d.businessId && d.businessId !== businessId) {
    throw new TenantViolationError("Cannot create a record for another business");
  }
  if (d.business) throw new TenantViolationError("Use businessId (not a business relation) through tenantDb");
  return { ...d, businessId };
}

export type TenantDb = ReturnType<typeof tenantDb>;
