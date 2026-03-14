import { NextResponse } from "next/server";
import connect from "@/lib/db";
import { cacheHeaders } from "@/lib/cache-headers";
import TicketDetailReport from "@/models/TicketDetailReport";

/** GET: return distinct values for filter dropdowns */
export async function GET() {
  try {
    await connect();

    const [
      assignedToOptions,
      disposedByOptions,
      landingQueueOptions,
      lastQueueOptions,
      createReasonOptions,
    ] = await Promise.all([
      TicketDetailReport.distinct("assignedTo"),
      TicketDetailReport.distinct("disposedBy"),
      TicketDetailReport.distinct("landingQueue"),
      TicketDetailReport.distinct("lastQueue"),
      TicketDetailReport.distinct("createReason"),
    ]);

    const strip = (arr) =>
      (arr || [])
        .map((v) => (v != null && v !== "" ? String(v).trim() : null))
        .filter(Boolean);
    const uniq = (arr) => [...new Set(arr)].sort();

    return NextResponse.json(
      {
        assignedToOptions: uniq(strip(assignedToOptions)),
        disposedByOptions: uniq(strip(disposedByOptions)),
        landingQueueOptions: uniq(strip(landingQueueOptions)),
        lastQueueOptions: uniq(strip(lastQueueOptions)),
        createReasonOptions: uniq(strip(createReasonOptions)),
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
