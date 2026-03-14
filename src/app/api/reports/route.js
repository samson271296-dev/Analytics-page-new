import { NextResponse } from "next/server";
import connect from "@/lib/db";
import { cacheHeaders } from "@/lib/cache-headers";
import AssignedToResolveReport from "@/models/AssignedToResolveReport";

function parseDate(val) {
  if (val == null || val === "") return null;
  const d = new Date(val);
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

    const dateFrom = parseDate(searchParams.get("dateFrom"));
    const dateTo = parseDate(searchParams.get("dateTo"));
    const assignToAgentName = searchParams.get("assignToAgentName")?.trim();
    const disposeByAgentName = searchParams.get("disposeByAgentName")?.trim();
    const dispositionSubStatus = searchParams.get("dispositionSubStatus")?.trim();
    const dispositionStatus = searchParams.get("dispositionStatus")?.trim();
    const landingQueue = searchParams.get("landingQueue")?.trim();
    const lastQueue = searchParams.get("lastQueue")?.trim();
    const source = searchParams.get("source")?.trim();
    const createReason = searchParams.get("createReason")?.trim();
    const ticketId = searchParams.get("ticketId")?.trim();

    const query = {};

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = dateFrom;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }
    if (assignToAgentName)
      query["raw.assignToAgentName"] = assignToAgentName;
    if (disposeByAgentName)
      query["raw.disposeByAgentName"] = disposeByAgentName;
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
