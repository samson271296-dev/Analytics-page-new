import mongoose from "mongoose";

const ticketDetailReportSchema = new mongoose.Schema(
  {
    ticketNo: { type: String, default: "" },
    createdAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    assignedTo: { type: String, default: "" },
    disposedBy: { type: String, default: "" },
    landingQueue: { type: String, default: "" },
    lastQueue: { type: String, default: "" },
    createReason: { type: String, default: "" },
    /** Full row from Excel – every column preserved */
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { strict: true }
);

const TicketDetailReport =
  mongoose.models.TicketDetailReport ||
  mongoose.model("TicketDetailReport", ticketDetailReportSchema);

export default TicketDetailReport;
