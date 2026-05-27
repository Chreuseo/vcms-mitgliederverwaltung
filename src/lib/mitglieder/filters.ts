import type { Prisma } from "@/generated/prisma";

export interface MitgliederFilters {
  gruppe: string[];
  status: string[];
  hvm: "yes" | "no" | null;
}

export function parseMultiValue(param: string | null | undefined): string[] {
  if (!param) return [];
  return param
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function parseMitgliederFiltersFromSearchParams(searchParams: URLSearchParams): MitgliederFilters {
  const hvmRaw = searchParams.get("hvm");
  const hvm = hvmRaw === "yes" || hvmRaw === "no" ? hvmRaw : null;

  return {
    gruppe: parseMultiValue(searchParams.get("gruppe")).map((value) => value.slice(0, 1)),
    status: parseMultiValue(searchParams.get("status")),
    hvm,
  };
}

export function buildMitgliederWhere(filters: MitgliederFilters): Prisma.BasePersonWhereInput {
  const where: Prisma.BasePersonWhereInput = {};

  if (filters.gruppe.length) where.gruppe = { in: filters.gruppe };
  if (filters.status.length) where.status = { in: filters.status };
  if (filters.hvm === "yes") where.hausvereinsmitglied = true;
  if (filters.hvm === "no") where.hausvereinsmitglied = false;

  return where;
}
