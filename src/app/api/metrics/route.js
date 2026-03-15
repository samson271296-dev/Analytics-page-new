import { NextRequest, NextResponse } from "next/server";
import connect from "@/lib/db";
import { cacheHeaders } from "@/lib/cache-headers";
import AssignedToResolveReport from "@/models/AssignedToResolveReport";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfYesterday() {
  const d = startOfToday();
  d.setDate(d.getDate() - 1);
  return d;
}

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
  // Prefer UTC ISO range from frontend (user's local time converted to UTC); fallback to date/time params
  const dateTimeFrom = searchParams.get("dateTimeFrom")?.trim();
  const dateTimeTo = searchParams.get("dateTimeTo")?.trim();
  let startDate = dateTimeFrom ? (() => { const d = new Date(dateTimeFrom); return isNaN(d.getTime()) ? null : d; })() : null;
  let endDate = dateTimeTo ? (() => { const d = new Date(dateTimeTo); return isNaN(d.getTime()) ? null : d; })() : null;
  if (!startDate || !endDate) {
    const dateFrom = searchParams.get("dateFrom")?.trim();
    const timeFrom = searchParams.get("timeFrom")?.trim();
    const dateTo = searchParams.get("dateTo")?.trim();
    const timeTo = searchParams.get("timeTo")?.trim();
    if (!startDate) startDate = parseDateTime(dateFrom, timeFrom);
    if (!endDate && dateTo) endDate = timeTo ? parseDateTime(dateTo, timeTo) : (() => { const e = new Date(dateTo + "T23:59:59.999"); return isNaN(e.getTime()) ? null : e; })();
  }
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = startDate;
    if (endDate) query.createdAt.$lte = endDate;
  }
  const assignToAgentName = searchParams.get("assignToAgentName")?.trim();
  const excludeAssignToAgentName = (searchParams.getAll?.("excludeAssignToAgentName") || []).filter(Boolean);
  const disposeByAgentName = searchParams.get("disposeByAgentName")?.trim();
  const excludeDisposeByAgentName = (searchParams.getAll?.("excludeDisposeByAgentName") || []).filter(Boolean);
  const dispositionSubStatus = searchParams.get("dispositionSubStatus")?.trim();
  const dispositionStatus = searchParams.get("dispositionStatus")?.trim();
  const landingQueue = searchParams.get("landingQueue")?.trim();
  const lastQueue = searchParams.get("lastQueue")?.trim();
  const source = searchParams.get("source")?.trim();
  const createReason = searchParams.get("createReason")?.trim();
  const ticketId = searchParams.get("ticketId")?.trim();
  if (assignToAgentName) query["raw.assignToAgentName"] = assignToAgentName;
  else if (excludeAssignToAgentName.length > 0) query["raw.assignToAgentName"] = { $nin: excludeAssignToAgentName };
  if (disposeByAgentName) query["raw.disposeByAgentName"] = disposeByAgentName;
  else if (excludeDisposeByAgentName.length > 0) query["raw.disposeByAgentName"] = { $nin: excludeDisposeByAgentName };
  if (dispositionSubStatus) query.dispositionSubStatus = dispositionSubStatus;
  if (dispositionStatus) query["raw.DispositionStatus"] = dispositionStatus;
  if (landingQueue) query["raw.Landing Queue Name"] = landingQueue;
  if (lastQueue) query["raw.Last Queue Name"] = lastQueue;
  if (source) query["raw.Source Before Assign"] = source;
  if (createReason) query["raw.Create Reason"] = createReason;
  if (ticketId) query.ticketId = ticketId;
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

    const today = startOfToday();
    const yesterday = startOfYesterday();

    const andFilter = (cond) =>
      Object.keys(filter).length ? { $and: [filter, cond] } : cond;

    // Summary aligns with Disposition Sub Status chart: Resolved = sub status Resolved|Closed only
    const resolvedMatch = andFilter({
      dispositionSubStatus: { $in: [/^resolved$/i, /^closed$/i] },
    });
    const pendingCondition = {
      $and: [
        { dispositionSubStatus: { $not: /^resolved$/i } },
        { dispositionSubStatus: { $not: /^closed$/i } },
      ],
    };
    const pendingMatch = andFilter(pendingCondition);
    // Customer waiting: customer replied and ticket not resolved (by disposition sub status only)
    const customerWaitingCond = andFilter({
      customerRepliedCount: { $gt: 0 },
      ...pendingCondition,
    });

    const [
      totalTickets,
      outOfSlaCount,
      overallUnattended,
      unattendedPrevDay,
      createdToday,
      totalAssigned,
      totalResolved,
      overallPending,
      pendingToday,
      overallCustomerWaiting,
      customerWaitingToday,
    ] = await Promise.all([
      AssignedToResolveReport.countDocuments(filter),
      AssignedToResolveReport.countDocuments(
        andFilter({ "raw.OldIsOutOfSla": /out\s*of\s*sla/i })
      ),
      AssignedToResolveReport.countDocuments(
        andFilter({ $or: [{ assignedAt: null }, { assignedAt: { $exists: false } }] })
      ),
      AssignedToResolveReport.countDocuments(
        andFilter({
          $or: [{ assignedAt: null }, { assignedAt: { $exists: false } }],
          createdAt: { $gte: yesterday, $lt: today },
        })
      ),
      AssignedToResolveReport.countDocuments(
        andFilter({ createdAt: { $gte: today } })
      ),
      AssignedToResolveReport.countDocuments(
        andFilter({ assignedAt: { $ne: null } })
      ),
      AssignedToResolveReport.countDocuments(resolvedMatch),
      AssignedToResolveReport.countDocuments(pendingMatch),
      AssignedToResolveReport.countDocuments(
        andFilter({ createdAt: { $gte: today }, ...pendingCondition })
      ),
      AssignedToResolveReport.countDocuments(customerWaitingCond),
      AssignedToResolveReport.countDocuments(
        andFilter({ createdAt: { $gte: today }, ...pendingCondition, customerRepliedCount: { $gt: 0 } })
      ),
    ]);

    const effectiveTotal =
      totalTickets > 0
        ? totalTickets
        : Math.max(1, totalResolved + overallPending);
    const resolvedPercent =
      Math.round((totalResolved / effectiveTotal) * 100);
    const pendingPercent =
      Math.round((overallPending / effectiveTotal) * 100);
    const outOfSlaPercent =
      Math.round((outOfSlaCount / effectiveTotal) * 100);

    return NextResponse.json(
      {
        totalTickets: effectiveTotal,
        outOfSlaCount,
        outOfSlaPercent,
        resolvedPercent,
        pendingPercent,
        overallUnattended,
        unattendedPrevDay,
        createdToday,
        totalAssigned,
        totalResolved,
        overallPending,
        pendingToday,
        overallCustomerWaiting,
        customerWaitingToday,
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
