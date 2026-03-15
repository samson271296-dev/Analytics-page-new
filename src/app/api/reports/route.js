import { NextResponse } from "next/server";
import connect from "@/lib/db";
import { cacheHeaders } from "@/lib/cache-headers";
import AssignedToResolveReport from "@/models/AssignedToResolveReport";

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

/** GET: return report rows with full details. Supports filters and pagination. */
export async function GET(request) {
  try {
    await connect();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(0, parseInt(searchParams.get("limit") || "0", 10)) || 10000,
      50000
    );
    const skip = Math.max(0, parseInt(searchParams.get("skip") || "0", 10));

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

    const query = {};

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }
    if (assignToAgentName)
      query["raw.assignToAgentName"] = assignToAgentName;
    else if (excludeAssignToAgentName.length > 0)
      query["raw.assignToAgentName"] = { $nin: excludeAssignToAgentName };
    if (disposeByAgentName)
      query["raw.disposeByAgentName"] = disposeByAgentName;
    else if (excludeDisposeByAgentName.length > 0)
      query["raw.disposeByAgentName"] = { $nin: excludeDisposeByAgentName };
    if (dispositionSubStatus)
      query.dispositionSubStatus = dispositionSubStatus;
    if (dispositionStatus)
      query["raw.DispositionStatus"] = dispositionStatus;
    if (landingQueue)
      query["raw.Landing Queue Name"] = landingQueue;
    if (lastQueue)
      query["raw.Last Queue Name"] = lastQueue;
    if (source)
      query["raw.Source Before Assign"] = source;
    if (createReason)
      query["raw.Create Reason"] = createReason;
    if (ticketId)
      query.ticketId = ticketId;

    const total = await AssignedToResolveReport.countDocuments(query);
    const reports = await AssignedToResolveReport.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return NextResponse.json(
      { total, skip, limit, reports },
      { headers: cacheHeaders }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { message: "Failed to fetch reports", error: err.message },
      { status: 500 }
    );
  }
}
