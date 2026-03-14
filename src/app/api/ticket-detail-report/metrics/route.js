import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import { cacheHeaders } from "@/lib/cache-headers";
import TicketDetailReport from "@/models/TicketDetailReport";

function parseDate(val) {
  if (val == null || val === "") return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function buildFilterQuery(searchParams) {
  const query = {};
  const dateFrom = parseDate(searchParams.get("dateFrom"));
  const dateTo = parseDate(searchParams.get("dateTo"));
  if (dateFrom || dateTo) {
    query.createdAt = {};
    if (dateFrom) query.createdAt.$gte = dateFrom;
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }
  const assignedTo = searchParams.get("assignedTo")?.trim();
  const disposedBy = searchParams.get("disposedBy")?.trim();
  const landingQueue = searchParams.get("landingQueue")?.trim();
  const lastQueue = searchParams.get("lastQueue")?.trim();
  const createReason = searchParams.get("createReason")?.trim();
  const ticketNo = searchParams.get("ticketNo")?.trim();
  if (assignedTo) query.assignedTo = assignedTo;
  if (disposedBy) query.disposedBy = disposedBy;
  if (landingQueue) query.landingQueue = landingQueue;
  if (lastQueue) query.lastQueue = lastQueue;
  if (createReason) query.createReason = createReason;
  if (ticketNo) query.ticketNo = ticketNo;
  return query;
}

export async function GET(request) {
  try {
    await connect();
    const searchParams =
      request instanceof NextRequest
        ? request.nextUrl.searchParams
        : new URL(request.url || "", "http://localhost").searchParams;
    const filter = buildFilterQuery(searchParams);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const andFilter = (cond) =>
      Object.keys(filter).length ? { $and: [filter, cond] } : cond;

    const hasResolvedDate = { resolvedAt: { $ne: null, $exists: true } };
    const resolvedMatch = andFilter(hasResolvedDate);
    const pendingMatch = andFilter({
      $or: [
        { resolvedAt: null },
        { resolvedAt: { $exists: false } },
      ],
    });

    const outOfSlaMatch = andFilter({
      "raw.Day SLA Status": /out\s*of\s*sla|out\s*sla/i,
    });

    const [
      totalTickets,
      totalResolved,
      overallPending,
      createdToday,
      resolvedToday,
      outOfSlaCount,
    ] = await Promise.all([
      TicketDetailReport.countDocuments(filter),
      TicketDetailReport.countDocuments(resolvedMatch),
      TicketDetailReport.countDocuments(pendingMatch),
      TicketDetailReport.countDocuments(
        andFilter({ createdAt: { $gte: today } })
      ),
      TicketDetailReport.countDocuments(
        andFilter({ resolvedAt: { $gte: today } })
      ),
      TicketDetailReport.countDocuments(outOfSlaMatch),
    ]);

    const effectiveTotal = totalTickets > 0 ? totalTickets : Math.max(1, totalResolved + overallPending);
    const resolvedPercent = Math.round((totalResolved / effectiveTotal) * 100);
    const pendingPercent = Math.round((overallPending / effectiveTotal) * 100);
    const outOfSlaPercent = effectiveTotal > 0 ? Math.round((outOfSlaCount / effectiveTotal) * 100) : 0;

    return NextResponse.json(
      {
        totalTickets: effectiveTotal,
        totalResolved,
        overallPending,
        resolvedPercent,
        pendingPercent,
        createdToday,
        resolvedToday,
        outOfSlaCount,
        outOfSlaPercent,
      },
      { headers: cacheHeaders }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { message: "Failed to calculate metrics", error: err.message },
      { status: 500 }
    );
  }
}
