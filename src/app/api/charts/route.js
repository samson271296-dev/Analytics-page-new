import { NextResponse } from "next/server";
import connect from "@/lib/db";
import { cacheHeaders } from "@/lib/cache-headers";
import AssignedToResolveReport from "@/models/AssignedToResolveReport";

function parseDate(val) {
  if (val == null || val === "") return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/** GET: return aggregated data for charts. Optional same filter params as /api/reports. */
export async function GET(request) {
  try {
    await connect();
    const { searchParams } = new URL(request.url);
    const dateFrom = parseDate(searchParams.get("dateFrom"));
    const dateTo = parseDate(searchParams.get("dateTo"));
    const assignToAgentName = searchParams.get("assignToAgentName")?.trim();
    const dispositionSubStatus = searchParams.get("dispositionSubStatus")?.trim();
    const landingQueue = searchParams.get("landingQueue")?.trim();
    const source = searchParams.get("source")?.trim();

    const match = {};
    if (dateFrom || dateTo) {
      match.createdAt = {};
      if (dateFrom) match.createdAt.$gte = dateFrom;
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        match.createdAt.$lte = end;
      }
    }
    if (assignToAgentName) match["raw.assignToAgentName"] = assignToAgentName;
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
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
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
