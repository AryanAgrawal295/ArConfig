import React, { useMemo, useState } from "react";
import axios from "axios";

async function downloadWorkbook(run) {
  try {
    const response = await axios.get(`/api/reports/${encodeURIComponent(run.outputFile)}`, {
      responseType: "blob",
    });
    const downloadUrl = window.URL.createObjectURL(response.data);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = run.outputFile;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    window.alert(error.response?.data?.error || "Unable to download this workbook.");
  }
}

function RunHistory({ runs }) {
  const [operation, setOperation] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const filteredRuns = useMemo(() => (runs || []).filter((run) =>
    (operation === "ALL" || (run.operation || "EXTRACT") === operation) &&
    (status === "ALL" || run.status === status)
  ), [runs, operation, status]);
  if (!runs || runs.length === 0) {
    return <p className="empty-state">No runs yet — generate a configuration snapshot first.</p>;
  }

  return (
    <>
    <div className="history-filters"><label>Operation<select value={operation} onChange={(event) => setOperation(event.target.value)}><option value="ALL">All</option><option value="EXTRACT">Extraction</option><option value="COMPARE">Comparison</option></select></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All</option><option value="success">Success</option><option value="partial">Partial</option><option value="failed">Failed</option></select></label></div>
    <table className="history-table">
      <thead>
        <tr>
          <th>Date/Time</th>
          <th>Type</th>
          <th>Environment(s)</th>
          <th>Setup</th>
          <th>Module / Area</th>
          <th>Tasks</th>
          <th>Records</th>
          <th>Duration</th>
          <th>Status</th>
          <th>File</th>
        </tr>
      </thead>
      <tbody>
        {filteredRuns.map((run) => (
          <tr key={run._id}>
            <td>{new Date(run.createdAt).toLocaleString()}</td>
            <td>{run.operation || "EXTRACT"}</td>
            <td>{run.operation === "COMPARE" ? `${run.sourceConnection?.name || "Source"} → ${run.targetConnection?.name || "Target"}` : run.sourceConnection?.name || "Current session"}</td>
            <td>{run.offeringName || "—"}</td>
            <td>{run.functionalAreaName || "Legacy Inventory Snapshot"}</td>
            <td>{run.taskCount || (run.subinventoryCount || run.locatorCount ? 1 : 0)}</td>
            <td>{run.recordCount || ((run.subinventoryCount || 0) + (run.locatorCount || 0))}</td>
            <td>{run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"}</td>
            <td className={run.status === "success" ? "status-ok" : "status-fail"}>
              {run.status}
              {run.errorMessage ? ` — ${run.errorMessage}` : ""}
            </td>
            <td>
              {run.outputFile ? (
                <button className="download-link" type="button" onClick={() => downloadWorkbook(run)}>
                  Download
                </button>
              ) : (
                "—"
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    {!filteredRuns.length && <p className="empty-state">No history entries match these filters.</p>}
    </>
  );
}

export default RunHistory;
