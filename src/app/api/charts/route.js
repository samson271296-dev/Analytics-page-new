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

/** GET: return aggregated data for charts. Optional same filter params as /api/reports. */
export async function GET(request) {
  try {
    await connect();
    const { searchParams } = new URL(request.url);
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
    const landingQueue = searchParams.get("landingQueue")?.trim();
    const source = searchParams.get("source")?.trim();

    const match = {};
    if (startDate || endDate) {
      match.createdAt = {};
      if (startDate) match.createdAt.$gte = startDate;
      if (endDate) match.createdAt.$lte = endDate;
    }
    if (assignToAgentName) match["raw.assignToAgentName"] = assignToAgentName;
    else if (excludeAssignToAgentName.length > 0) match["raw.assignToAgentName"] = { $nin: excludeAssignToAgentName };
    if (disposeByAgentName) match["raw.disposeByAgentName"] = disposeByAgentName;
    else if (excludeDisposeByAgentName.length > 0) match["raw.disposeByAgentName"] = { $nin: excludeDisposeByAgentName };
    if (dispositionSubStatus) match.dispositionSubStatus = dispositionSubStatus;
    if (landingQueue) match["raw.Landing Queue Name"] = landingQueue;
    if (source) match["raw.Source Before Assign"] = source;

    const baseStages = Object.keys(match).length ? [{ $match: match }] : [];

    const [
      byDispositionSubStatus,
      byAssignToAgent,
      byDisposeByAgent,
      byLandingQueue,
      byLastQueue,
      bySource,
      byCreateReason,
      byDay,
      byTeamLeader,
      byAssignEntryStatus,
      byOldIsOutOfSla,
      byDispositionStatus,
    ] = await Promise.all([
      AssignedToResolveReport.aggregate([
        ...baseStages,
        { $group: { _id: "$dispositionSubStatus", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
    ]),
      AssignedToResolveReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.assignToAgentName", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 100 },
    ]),
      AssignedToResolveReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.disposeByAgentName", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 100 },
    ]),
      AssignedToResolveReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.Landing Queue Name", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
    ]),
      AssignedToResolveReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.Last Queue Name", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
    ]),
      AssignedToResolveReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.Source Before Assign", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
    ]),
      AssignedToResolveReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.Create Reason", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
    ]),
      AssignedToResolveReport.aggregate([
        ...baseStages,
        {
          $group: {
            _id: {
              // Group by createdAt day using IST (+05:30) so dates
              // match what the user sees on the dashboard filters.
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: "+05:30",
              },
            },
            count: { $sum: 1 },
          },
        },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { _id: 1 } },
        { $limit: 60 },
      ]),
      AssignedToResolveReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.Team Leader", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),
      AssignedToResolveReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.AssignEntryStatus", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
      ]),
      AssignedToResolveReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.OldIsOutOfSla", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
      ]),
      AssignedToResolveReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.DispositionStatus", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
      ]),
    ]);

    return NextResponse.json(
      {
        byDispositionSubStatus: byDispositionSubStatus.map((x) => ({
          label: x._id || "(empty)",
          count: x.count,
        })),
        byAssignToAgent: byAssignToAgent.map((x) => ({
          label: x._id || "(empty)",
          count: x.count,
        })),
        byDisposeByAgent: byDisposeByAgent.map((x) => ({
          label: x._id || "(empty)",
          count: x.count,
        })),
        byLandingQueue: byLandingQueue.map((x) => ({
          label: x._id || "(empty)",
          count: x.count,
        })),
        byLastQueue: byLastQueue.map((x) => ({
          label: x._id || "(empty)",
          count: x.count,
        })),
        bySource: bySource.map((x) => ({
          label: x._id || "(empty)",
          count: x.count,
        })),
        byCreateReason: byCreateReason.map((x) => ({
          label: x._id || "(empty)",
          count: x.count,
        })),
        byDay: byDay.map((x) => ({
          label: x._id,
          count: x.count,
        })),
        byTeamLeader: byTeamLeader.map((x) => ({
          label: x._id || "(empty)",
          count: x.count,
        })),
        byAssignEntryStatus: byAssignEntryStatus.map((x) => ({
          label: x._id || "(empty)",
          count: x.count,
        })),
        byOldIsOutOfSla: byOldIsOutOfSla.map((x) => ({
          label: String(x._id || "").trim() || "(empty)",
          count: x.count,
        })),
        byDispositionStatus: byDispositionStatus.map((x) => ({
          label: x._id || "(empty)",
          count: x.count,
        })),
      },
      { headers: cacheHeaders }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { message: "Failed to fetch chart data", error: err.message },
      { status: 500 }
    );
  }
}
