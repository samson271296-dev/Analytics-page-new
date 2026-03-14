import mongoose from "mongoose";

const assignedToResolveReportSchema = new mongoose.Schema(
  {
    ticketId: { type: String, default: "" },
    createdAt: { type: Date, default: null },
    assignedAt: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
    dispositionSubStatus: { type: String, default: "" },
    customerRepliedCount: { type: Number, default: 0 },
    /** Full row from Excel – every column preserved, no data skipped */
    raw: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { strict: true }
);

const AssignedToResolveReport =
  mongoose.models.AssignedToResolveReport ||
  mongoose.model("AssignedToResolveReport", assignedToResolveReportSchema);

export default AssignedToResolveReport;
