import { NextResponse } from "next/server";
import connect from "@/lib/db";
import { cacheHeaders } from "@/lib/cache-headers";
import TicketDetailReport from "@/models/TicketDetailReport";

function parseDate(val) {
  if (val == null || val === "") return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

/** GET: return aggregated data for charts. Same filter params as reports. */
export async function GET(request) {
  try {
    await connect();
    const { searchParams } = new URL(request.url);
    const dateFrom = parseDate(searchParams.get("dateFrom"));
    const dateTo = parseDate(searchParams.get("dateTo"));
    const assignedTo = searchParams.get("assignedTo")?.trim();
    const disposedBy = searchParams.get("disposedBy")?.trim();
    const landingQueue = searchParams.get("landingQueue")?.trim();
    const createReason = searchParams.get("createReason")?.trim();

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
    if (assignedTo) match.assignedTo = assignedTo;
    if (disposedBy) match.disposedBy = disposedBy;
    if (landingQueue) match.landingQueue = landingQueue;
    if (createReason) match.createReason = createReason;

    const baseStages = Object.keys(match).length ? [{ $match: match }] : [];

    const [
      byAssignedTo,
      byDisposedBy,
      byLandingQueue,
      byLastQueue,
      byCreateReason,
      byDay,
      byDaySlaStatus,
      byCreateSourceType,
      byFolder,
      byBranch,
      byFtr,
      byTicketType,
      byMoc,
      byResolvedBy,
      byFirstResponseBy,
      byLandingFolder,
      byDisposedFolder,
      bySubFolder,
      byDispositionFolderLevel3,
      byDispositionFolderLevel4,
      byCurrentQueueName,
      byQueueGroupName,
      byFirstResolvedQueue,
      bySicName,
      byAsicName,
      byBccdState,
      byBccdCity,
      byAssignedEmpCity,
      byFirstAssigneeEmployeeName,
      byAssigneeManagerName,
      byLastReopenBy,
      byDisposeFolderGroup,
      byFirstResolvedByAgentCenter,
      byLastResolvedByAgentCenter,
      byFirstResponseSla,
      byFirstResponseSlaNew,
      byFolderSla,
      byCreateToFirstDisposeFolderSla,
      byPendingAtDesignation,
      byResolvedByUploader,
      byLastSourceType,
      byDispositionFolderHierarchy,
      byMonth,
      byCreatedBy,
      byLandingFolderHierarchy,
    ] = await Promise.all([
      TicketDetailReport.aggregate([
        ...baseStages,
        { $group: { _id: "$assignedTo", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 50 },
      ]),
      TicketDetailReport.aggregate([
        ...baseStages,
        { $group: { _id: "$disposedBy", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 50 },
      ]),
      TicketDetailReport.aggregate([
        ...baseStages,
        { $group: { _id: "$landingQueue", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 25 },
      ]),
      TicketDetailReport.aggregate([
        ...baseStages,
        { $group: { _id: "$lastQueue", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 25 },
      ]),
      TicketDetailReport.aggregate([
        ...baseStages,
        { $group: { _id: "$createReason", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 25 },
      ]),
      TicketDetailReport.aggregate([
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
      TicketDetailReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.Day SLA Status", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),
      TicketDetailReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.Create Source Type", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),
      TicketDetailReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.Folder", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]),
      TicketDetailReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.BRANCH", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),
      TicketDetailReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.FTR", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      TicketDetailReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.Ticket Type(parent/sub)", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      TicketDetailReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.MOC", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),
      TicketDetailReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.Resolved By", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 30 },
      ]),
      TicketDetailReport.aggregate([
        ...baseStages,
        { $group: { _id: "$raw.First Response By", count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { count: -1 } },
        { $limit: 30 },
      ]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Landing Folder", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 25 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Disposed Folder", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 25 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Sub Folder", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 25 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Disposition Folder Level 3", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 25 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Disposition Folder Level 4", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 25 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Current Queue Name", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 25 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.QueueGroup Name", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 20 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.First Resolved Queue", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 20 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.SIC Name", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 20 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.ASIC Name", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 20 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.BCCD State", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 20 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.BCCD City", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 20 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Assigned Emp City", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 20 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.First Assignee Employee Name", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 30 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Assignee Manager Name", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 25 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Last Reopen By", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 25 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Dispose Folder Group", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 20 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.First Resolved By Agent Center Name", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 20 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Last Resolved By Agent Center Name", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 20 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Firsrt response SLA", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 15 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Firsrt response SLA New", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 15 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Folder Sla", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 15 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Create To First Dispose Folder SLA", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 15 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Pending At Designation", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 15 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Resolved By Uploader", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 15 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Last Source Type", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 15 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Disposition Folder Hierarchy", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 20 }]),
      TicketDetailReport.aggregate([
        ...baseStages,
        { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
        { $match: { _id: { $ne: null, $ne: "" } } },
        { $sort: { _id: 1 } },
        { $limit: 24 },
      ]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Created By", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 25 }]),
      TicketDetailReport.aggregate([...baseStages, { $group: { _id: "$raw.Landing Folder Hierarchy", count: { $sum: 1 } } }, { $match: { _id: { $ne: null, $ne: "" } } }, { $sort: { count: -1 } }, { $limit: 20 }]),
    ]);

    const mapLabel = (x) => ({ label: x._id || "(empty)", count: x.count });

    return NextResponse.json(
      {
        byAssignedTo: byAssignedTo.map(mapLabel),
        byDisposedBy: byDisposedBy.map(mapLabel),
        byLandingQueue: byLandingQueue.map(mapLabel),
        byLastQueue: byLastQueue.map(mapLabel),
        byCreateReason: byCreateReason.map(mapLabel),
        byDay: byDay.map((x) => ({ label: x._id, count: x.count })),
        byDaySlaStatus: byDaySlaStatus.map(mapLabel),
        byCreateSourceType: byCreateSourceType.map(mapLabel),
        byFolder: byFolder.map(mapLabel),
        byBranch: byBranch.map(mapLabel),
        byFtr: byFtr.map(mapLabel),
        byTicketType: byTicketType.map(mapLabel),
        byMoc: byMoc.map(mapLabel),
        byResolvedBy: byResolvedBy.map(mapLabel),
        byFirstResponseBy: byFirstResponseBy.map(mapLabel),
        byLandingFolder: byLandingFolder.map(mapLabel),
        byDisposedFolder: byDisposedFolder.map(mapLabel),
        bySubFolder: bySubFolder.map(mapLabel),
        byDispositionFolderLevel3: byDispositionFolderLevel3.map(mapLabel),
        byDispositionFolderLevel4: byDispositionFolderLevel4.map(mapLabel),
        byCurrentQueueName: byCurrentQueueName.map(mapLabel),
        byQueueGroupName: byQueueGroupName.map(mapLabel),
        byFirstResolvedQueue: byFirstResolvedQueue.map(mapLabel),
        bySicName: bySicName.map(mapLabel),
        byAsicName: byAsicName.map(mapLabel),
        byBccdState: byBccdState.map(mapLabel),
        byBccdCity: byBccdCity.map(mapLabel),
        byAssignedEmpCity: byAssignedEmpCity.map(mapLabel),
        byFirstAssigneeEmployeeName: byFirstAssigneeEmployeeName.map(mapLabel),
        byAssigneeManagerName: byAssigneeManagerName.map(mapLabel),
        byLastReopenBy: byLastReopenBy.map(mapLabel),
        byDisposeFolderGroup: byDisposeFolderGroup.map(mapLabel),
        byFirstResolvedByAgentCenter: byFirstResolvedByAgentCenter.map(mapLabel),
        byLastResolvedByAgentCenter: byLastResolvedByAgentCenter.map(mapLabel),
        byFirstResponseSla: byFirstResponseSla.map(mapLabel),
        byFirstResponseSlaNew: byFirstResponseSlaNew.map(mapLabel),
        byFolderSla: byFolderSla.map(mapLabel),
        byCreateToFirstDisposeFolderSla: byCreateToFirstDisposeFolderSla.map(mapLabel),
        byPendingAtDesignation: byPendingAtDesignation.map(mapLabel),
        byResolvedByUploader: byResolvedByUploader.map(mapLabel),
        byLastSourceType: byLastSourceType.map(mapLabel),
        byDispositionFolderHierarchy: byDispositionFolderHierarchy.map(mapLabel),
        byMonth: byMonth.map((x) => ({ label: x._id, count: x.count })),
        byCreatedBy: byCreatedBy.map(mapLabel),
        byLandingFolderHierarchy: byLandingFolderHierarchy.map(mapLabel),
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
