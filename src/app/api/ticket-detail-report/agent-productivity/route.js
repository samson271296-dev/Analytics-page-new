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

/** GET: agent productivity summary – counts and percentages for first/last response, resolved, FTR, SLA, waiting for customer, etc. */
export async function GET(request) {
  try {
    await connect();
    const searchParams =
      request instanceof NextRequest
        ? request.nextUrl.searchParams
        : new URL(request.url || "", "http://localhost").searchParams;
    const filter = buildFilterQuery(searchParams);
    const matchStage = Object.keys(filter).length ? [{ $match: filter }] : [];

    const totalResult = await TicketDetailReport.aggregate([
      ...matchStage,
      { $count: "total" },
    ]);
    const total = totalResult[0]?.total ?? 0;
    const safeTotal = total > 0 ? total : 1;

    const [
      firstResponseByResult,
      lastResponseByResult,
      resolvedByResult,
      disposedByResult,
      ftrYesResult,
      firstResponseSlaWithinResult,
      outOfSlaResult,
      reopenedResult,
      manualReopenResult,
      sumsResult,
      uniqueFirstResponseResult,
      uniqueResolvedResult,
      uniqueDisposedResult,
      firstAssignResult,
      parentTicketResult,
      childTicketResult,
      mergedTicketResult,
      resolvedByUploaderYesResult,
      pendingAtDesignationResult,
      createSourceEmailResult,
      firstResponseSlaBreachedResult,
      uniqueBranchesResult,
      uniqueLandingQueuesResult,
      waitingForCustomerResult,
    ] = await Promise.all([
      TicketDetailReport.aggregate([
        ...matchStage,
        { $match: { "raw.First Response By": { $exists: true, $nin: [null, ""] } } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        { $match: { "raw.Last Response By": { $exists: true, $nin: [null, ""] } } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        {
          $match: {
            $or: [
              { resolvedAt: { $ne: null, $exists: true } },
              { "raw.Resolved Date": { $exists: true, $nin: [null, ""] } },
              { "raw.Resolved Time": { $exists: true, $nin: [null, ""] } },
            ],
          },
        },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        { $match: { "raw.Disposed By": { $exists: true, $nin: [null, ""] } } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        { $match: { "raw.FTR": { $in: ["Yes", "yes", "YES"] } } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        { $match: { "raw.Firsrt response SLA New": { $regex: /within\s*sla/i } } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        { $match: { "raw.Day SLA Status": { $regex: /out.*sla|sla.*out/i } } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        { $addFields: { reopenNum: { $toLong: { $ifNull: ["$raw.Reopen Count", 0] } } } },
        { $match: { reopenNum: { $gt: 0 } } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        { $addFields: { manualReopenNum: { $toLong: { $ifNull: ["$raw.Manual Reopen Count", 0] } } } },
        { $match: { manualReopenNum: { $gt: 0 } } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        {
          $group: {
            _id: null,
            totalInteractionCount: { $sum: { $toLong: { $ifNull: ["$raw.Total Interaction Count", 0] } } },
            agentReplyCount: { $sum: { $toLong: { $ifNull: ["$raw.Agent Reply Count(Excluding Bot)", 0] } } },
            botReplyCount: { $sum: { $toLong: { $ifNull: ["$raw.Bot Reply Count", 0] } } },
            disposeCount: { $sum: { $toLong: { $ifNull: ["$raw.Dispose Count", 0] } } },
            interactionCountAgent: { $sum: { $toLong: { $ifNull: ["$raw.Interaction Count Agent", 0] } } },
            interactionCountCustomer: { $sum: { $toLong: { $ifNull: ["$raw.Interation count Customer", 0] } } },
          },
        },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        { $match: { "raw.First Response By": { $exists: true, $nin: [null, ""] } } },
        { $group: { _id: "$raw.First Response By" } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        { $match: { "raw.Resolved By": { $exists: true, $nin: [null, ""] } } },
        { $group: { _id: "$raw.Resolved By" } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        { $match: { "raw.Disposed By": { $exists: true, $nin: [null, ""] } } },
        { $group: { _id: "$raw.Disposed By" } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        {
          $match: {
            $or: [
              { "raw.First Assign Date": { $exists: true, $nin: [null, ""] } },
              { "raw.First Assign Time": { $exists: true, $nin: [null, ""] } },
            ],
          },
        },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        { $match: { "raw.Ticket Type(parent/sub)": { $regex: /parent/i } } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        { $match: { "raw.Ticket Type(parent/sub)": { $regex: /child|sub/i } } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        {
          $match: {
            $or: [
              { "raw.Merged Ticket Count": { $gt: 0 } },
              { "raw.Merge Ticket Ids": { $exists: true, $nin: [null, ""] } },
            ],
          },
        },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        { $match: { "raw.Resolved By Uploader": { $in: ["Yes", "yes", "YES"] } } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        { $match: { "raw.Pending At Designation": { $exists: true, $nin: [null, ""] } } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        { $match: { "raw.Create Source Type": { $regex: /^email$/i } } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        { $match: { "raw.Firsrt response SLA New": { $regex: /breach|out\s*of|exceed/i } } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        { $match: { "raw.BRANCH": { $exists: true, $nin: [null, ""] } } },
        { $group: { _id: "$raw.BRANCH" } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        { $match: { "raw.Landing Queue": { $exists: true, $nin: [null, ""] } } },
        { $group: { _id: "$raw.Landing Queue" } },
        { $count: "count" },
      ]),
      TicketDetailReport.aggregate([
        ...matchStage,
        {
          $match: {
            $or: [
              { "raw.Pending At Designation": { $regex: /customer/i } },
              { "raw.Pending At Designation (PR)": { $regex: /customer/i } },
            ],
          },
        },
        { $count: "count" },
      ]),
    ]);

    const firstResponseByCount = firstResponseByResult[0]?.count ?? 0;
    const lastResponseByCount = lastResponseByResult[0]?.count ?? 0;
    const resolvedByCount = resolvedByResult[0]?.count ?? 0;
    const disposedByCount = disposedByResult[0]?.count ?? 0;
    const ftrYesCount = ftrYesResult[0]?.count ?? 0;
    const firstResponseSlaWithinCount = firstResponseSlaWithinResult[0]?.count ?? 0;
    const outOfSlaCount = outOfSlaResult[0]?.count ?? 0;
    const reopenedCount = reopenedResult[0]?.count ?? 0;
    const manualReopenCount = manualReopenResult[0]?.count ?? 0;
    const firstAssignCount = firstAssignResult[0]?.count ?? 0;
    const parentTicketCount = parentTicketResult[0]?.count ?? 0;
    const childTicketCount = childTicketResult[0]?.count ?? 0;
    const mergedTicketCount = mergedTicketResult[0]?.count ?? 0;
    const resolvedByUploaderYesCount = resolvedByUploaderYesResult[0]?.count ?? 0;
    const pendingAtDesignationCount = pendingAtDesignationResult[0]?.count ?? 0;
    const createSourceEmailCount = createSourceEmailResult[0]?.count ?? 0;
    const firstResponseSlaBreachedCount = firstResponseSlaBreachedResult[0]?.count ?? 0;
    const uniqueBranches = uniqueBranchesResult[0]?.count ?? 0;
    const uniqueLandingQueues = uniqueLandingQueuesResult[0]?.count ?? 0;
    const waitingForCustomerCount = waitingForCustomerResult[0]?.count ?? 0;

    const sums = sumsResult[0] || {};
    const totalInteractionCount = sums.totalInteractionCount ?? 0;
    const totalAgentReplyCount = sums.agentReplyCount ?? 0;
    const totalBotReplyCount = sums.botReplyCount ?? 0;
    const totalDisposeCount = sums.disposeCount ?? 0;
    const totalInteractionCountAgent = sums.interactionCountAgent ?? 0;
    const totalInteractionCountCustomer = sums.interactionCountCustomer ?? 0;

    const uniqueFirstResponseAgents = uniqueFirstResponseResult[0]?.count ?? 0;
    const uniqueResolvedByAgents = uniqueResolvedResult[0]?.count ?? 0;
    const uniqueDisposedByAgents = uniqueDisposedResult[0]?.count ?? 0;

    const pct = (n) => Math.round((n / safeTotal) * 100);

    const body = {
      total,
      firstResponseBy: { count: firstResponseByCount, percent: pct(firstResponseByCount) },
      lastResponseBy: { count: lastResponseByCount, percent: pct(lastResponseByCount) },
      resolvedBy: { count: resolvedByCount, percent: pct(resolvedByCount) },
      disposedBy: { count: disposedByCount, percent: pct(disposedByCount) },
      ftrYes: { count: ftrYesCount, percent: pct(ftrYesCount) },
      firstResponseSlaWithin: { count: firstResponseSlaWithinCount, percent: pct(firstResponseSlaWithinCount) },
      firstResponseSlaBreached: { count: firstResponseSlaBreachedCount, percent: pct(firstResponseSlaBreachedCount) },
      outOfSla: { count: outOfSlaCount, percent: pct(outOfSlaCount) },
      reopened: { count: reopenedCount, percent: pct(reopenedCount) },
      manualReopen: { count: manualReopenCount, percent: pct(manualReopenCount) },
      firstAssign: { count: firstAssignCount, percent: pct(firstAssignCount) },
      parentTickets: { count: parentTicketCount, percent: pct(parentTicketCount) },
      childTickets: { count: childTicketCount, percent: pct(childTicketCount) },
      mergedTickets: { count: mergedTicketCount, percent: pct(mergedTicketCount) },
      resolvedByUploaderYes: { count: resolvedByUploaderYesCount, percent: pct(resolvedByUploaderYesCount) },
      pendingAtDesignation: { count: pendingAtDesignationCount, percent: pct(pendingAtDesignationCount) },
      waitingForCustomer: { count: waitingForCustomerCount, percent: pct(waitingForCustomerCount) },
      createSourceEmail: { count: createSourceEmailCount, percent: pct(createSourceEmailCount) },
      totalInteractionCount,
      totalAgentReplyCount,
      totalBotReplyCount,
      totalDisposeCount,
      totalInteractionCountAgent,
      totalInteractionCountCustomer,
      uniqueFirstResponseAgents,
      uniqueResolvedByAgents,
      uniqueDisposedByAgents,
      uniqueBranches,
      uniqueLandingQueues,
    };

    return NextResponse.json(body, { headers: cacheHeaders });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { message: "Failed to load agent productivity", error: err.message },
      { status: 500 }
    );
  }
}
