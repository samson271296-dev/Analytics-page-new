import { NextResponse } from "next/server";
import connect from "@/lib/db";
import { cacheHeaders } from "@/lib/cache-headers";
import AssignedToResolveReport from "@/models/AssignedToResolveReport";

/** GET: return distinct values for filter dropdowns (agents, statuses, queues, etc.) */
export async function GET() {
  try {
    await connect();

    const [
      assignToAgentNames,
      disposeByAgentNames,
      dispositionSubStatuses,
      dispositionStatuses,
      landingQueueNames,
      lastQueueNames,
      sources,
      createReasons,
    ] = await Promise.all([
      AssignedToResolveReport.distinct("raw.assignToAgentName"),
      AssignedToResolveReport.distinct("raw.disposeByAgentName"),
      AssignedToResolveReport.distinct("dispositionSubStatus"),
      AssignedToResolveReport.distinct("raw.DispositionStatus"),
      AssignedToResolveReport.distinct("raw.Landing Queue Name"),
      AssignedToResolveReport.distinct("raw.Last Queue Name"),
      AssignedToResolveReport.distinct("raw.Source Before Assign"),
      AssignedToResolveReport.distinct("raw.Create Reason"),
    ]);

    const strip = (arr) =>
      (arr || [])
        .map((v) => (v != null && v !== "" ? String(v).trim() : null))
        .filter(Boolean);
    const uniq = (arr) => [...new Set(arr)].sort();

    return NextResponse.json(
      {
        assignToAgentNames: uniq(strip(assignToAgentNames)),
        disposeByAgentNames: uniq(strip(disposeByAgentNames)),
        dispositionSubStatuses: uniq(strip(dispositionSubStatuses)),
        dispositionStatuses: uniq(strip(dispositionStatuses)),
        landingQueueNames: uniq(strip(landingQueueNames)),
        lastQueueNames: uniq(strip(lastQueueNames)),
        sources: uniq(strip(sources)),
        createReasons: uniq(strip(createReasons)),
      },
      { headers: cacheHeaders }
    );
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { message: "Failed to fetch filter options", error: err.message },
      { status: 500 }
    );
  }
}
