import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import { cacheHeaders } from "@/lib/cache-headers";
import TicketDetailReport from "@/models/TicketDetailReport";

function parseDate(val) {
  if (val == null || val === "") return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function parseDateTime(dateStr, timeStr) {
  if (dateStr == null || String(dateStr).trim() === "") return null;
  const dateOnly = String(dateStr).trim();
  const timeOnly = timeStr != null && String(timeStr).trim() !== "" ? String(timeStr).trim() : null;
  const combined = timeOnly ? `${dateOnly}T${timeOnly}` : `${dateOnly}T00:00:00`;
  const d = new Date(combined);
  return isNaN(d.getTime()) ? null : d;
}

function buildFilterQuery(searchParams) {
  const query = {};
  const dateFrom = searchParams.get("dateFrom")?.trim();
  const timeFrom = searchParams.get("timeFrom")?.trim();
  const dateTo = searchParams.get("dateTo")?.trim();
  const timeTo = searchParams.get("timeTo")?.trim();
  const startDate = parseDateTime(dateFrom, timeFrom);
  const endDate = dateTo ? (timeTo ? parseDateTime(dateTo, timeTo) : (() => { const e = new Date(dateTo + "T23:59:59.999"); return isNaN(e.getTime()) ? null : e; })()) : null;
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }
  const assignedTo = searchParams.get("assignedTo")?.trim();
  const excludeAssignedTo = (searchParams.getAll?.("excludeAssignedTo") || []).filter(Boolean);
  const disposedBy = searchParams.get("disposedBy")?.trim();
  const landingQueue = searchParams.get("landingQueue")?.trim();
  const lastQueue = searchParams.get("lastQueue")?.trim();
  const createReason = searchParams.get("createReason")?.trim();
  const ticketNo = searchParams.get("ticketNo")?.trim();
  if (assignedTo) query.assignedTo = assignedTo;
  else if (excludeAssignedTo.length > 0) query.assignedTo = { $nin: excludeAssignedTo };
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

    // Resolved: has top-level resolvedAt set, OR raw has "Resolved Date" / "Resolved Time" with a value
    const hasResolvedDate = {
      $or: [
        { resolvedAt: { $ne: null, $exists: true } },
        { "raw.Resolved Date": { $exists: true, $nin: [null, ""] } },
        { "raw.Resolved Time": { $exists: true, $nin: [null, ""] } },
      ],
    };
    const resolvedMatch = andFilter(hasResolvedDate);
    // Pending = no reply yet (no First Response By / no first response on the ticket)
    const pendingMatch = andFilter({
      $nor: [{ "raw.First Response By": { $exists: true, $nin: [null, ""] } }],
    });

    // Out of SLA: "Day SLA Status" contains "out" and "sla" (e.g. "Out Of Sla", "Out of SLA")
    const outOfSlaMatch = andFilter({
      "raw.Day SLA Status": { $regex: /out.*sla|sla.*out/i },
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
