import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

function key(task) { return task.code || task.name; }

function CompareView({ offerings, addLog, refreshHistory, onOpenSettings }) {
  const [connections, setConnections] = useState([]);
  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [offering, setOffering] = useState(null);
  const [areas, setAreas] = useState([]);
  const [area, setArea] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [selected, setSelected] = useState([]);
  const [orgCodes, setOrgCodes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [comparison, setComparison] = useState(null);
  const selectedTasks = useMemo(() => tasks.filter((task) => selected.includes(key(task))), [tasks, selected]);

  useEffect(() => {
    axios.get("/api/environments").then((response) => setConnections(response.data.connections || []))
      .catch((error) => setMessage({ type: "error", text: error.response?.data?.error || error.message }));
  }, []);

  const selectOffering = async (event) => {
    const next = offerings.find((item) => item.code === event.target.value) || null;
    setOffering(next); setArea(null); setAreas([]); setTasks([]); setSelected([]); setComparison(null);
    if (!next) return;
    setBusy(true);
    try {
      const response = await axios.post("/api/setup/functional-areas", { offering: next });
      setAreas(response.data.functionalAreas || []);
    } catch (error) { setMessage({ type: "error", text: error.response?.data?.error || error.message }); }
    finally { setBusy(false); }
  };

  const selectArea = async (event) => {
    const next = areas.find((item) => item.code === event.target.value) || null;
    setArea(next); setTasks([]); setSelected([]); setComparison(null);
    if (!next) return;
    setBusy(true);
    try {
      const response = await axios.post("/api/setup/area-tasks", { functionalAreaCode: next.code, functionalAreaName: next.name });
      const nextTasks = response.data.tasks || [];
      setTasks(nextTasks);
      setSelected(nextTasks.filter((task) => task.available !== false && task.exportSupported).map(key));
    } catch (error) { setMessage({ type: "error", text: error.response?.data?.error || error.message }); }
    finally { setBusy(false); }
  };

  const run = async () => {
    setBusy(true); setMessage(null); setComparison(null);
    try {
      const response = await axios.post("/api/comparison/run", {
        sourceConnectionId: sourceId, targetConnectionId: targetId,
        offering, functionalArea: area, module: area?.name, tasks: selectedTasks, orgCodes,
      });
      setComparison(response.data);
      setMessage({ type: "success", text: "Comparison completed and the Excel report is ready." });
      if (addLog) addLog(`Compared ${selectedTasks.length} configuration items.`, "success");
      if (refreshHistory) refreshHistory();
    } catch (error) {
      const text = error.response?.data?.error || error.message;
      setMessage({ type: "error", text }); if (addLog) addLog(`Comparison failed: ${text}`, "error");
    } finally { setBusy(false); }
  };

  const download = async () => {
    const response = await axios.get(comparison.downloadUrl, { responseType: "blob" });
    const url = window.URL.createObjectURL(response.data); const link = document.createElement("a");
    link.href = url; link.download = comparison.run.outputFile; document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
  };

  const summary = comparison?.summary;
  const detailedRows = (comparison?.results || []).flatMap((result) => result.status === "MODIFIED"
    ? result.changes.map((change) => ({ ...change, recordKey: result.recordKey, configurationName: result.configurationName, dataset: result.dataset, status: result.status }))
    : [{ recordKey: result.recordKey, configurationName: result.configurationName, dataset: result.dataset, status: result.status, field: "", sourceValue: "", targetValue: "" }]);

  return (
    <>
      <div className="page-heading"><h1>Configuration Compare</h1><p>Extract the same configuration from two saved Oracle environments and compare it by stable business keys.</p></div>
      <section className="panel-card">
        <h2>Comparison Configuration</h2>
        {connections.length < 2 && (
          <div className="catalog-note compare-empty-state">
            <p>Comparison needs at least two saved Oracle environments. Save DEV, SIT, UAT, or PROD in Settings first, then come back here.</p>
            {onOpenSettings && <button type="button" className="outline-button compact-button" onClick={onOpenSettings}>Open Settings</button>}
          </div>
        )}
        <div className="compare-environments">
          <label>Source Environment<select value={sourceId} onChange={(event) => setSourceId(event.target.value)} disabled={connections.length === 0}><option value="">{connections.length ? "Select source" : "No saved environments"}</option>{connections.map((item) => <option value={item._id} key={item._id}>{item.name} ({item.environmentType})</option>)}</select></label>
          <strong>VS</strong>
          <label>Target Environment<select value={targetId} onChange={(event) => setTargetId(event.target.value)} disabled={connections.length === 0}><option value="">{connections.length ? "Select target" : "No saved environments"}</option>{connections.map((item) => <option value={item._id} key={item._id}>{item.name} ({item.environmentType})</option>)}</select></label>
        </div>
        <div className="selection-grid compare-selection">
          <label>Setup<select value={offering?.code || ""} onChange={selectOffering}><option value="">Select setup</option>{offerings.map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}</select></label>
          <label>Functional Area / Module<select value={area?.code || ""} onChange={selectArea} disabled={!offering}><option value="">Select area</option>{areas.map((item) => <option value={item.code} key={item.code}>{item.name}</option>)}</select></label>
          <label>Business Unit / Scope<input value={orgCodes} onChange={(event) => setOrgCodes(event.target.value)} placeholder="ALL or M1" /></label>
        </div>
        <div className="task-heading"><div><h2>Configuration Items</h2><p>{selectedTasks.length} of {tasks.length} selected</p></div><button type="button" className="outline-button compact-button" onClick={() => setSelected(tasks.filter((task) => task.available !== false && task.exportSupported).map(key))}>Select Exportable</button></div>
        <div className="task-list compare-task-list">{tasks.map((task) => { const enabled = task.available !== false && task.exportSupported; return <label className={`task-option ${enabled ? "" : "task-disabled"}`} key={key(task)}><input type="checkbox" checked={selected.includes(key(task))} disabled={!enabled || busy} onChange={() => setSelected((current) => current.includes(key(task)) ? current.filter((item) => item !== key(task)) : [...current, key(task)])} /><span><strong>{task.name}</strong></span></label>; })}{!tasks.length && <p className="empty-state">Select a setup and functional area to load configuration items.</p>}</div>
        <div className="button-row compare-actions"><button onClick={run} disabled={busy || !sourceId || !targetId || sourceId === targetId || !selectedTasks.length}>{busy ? "Comparing..." : "Run Comparison"}</button>{comparison && <button className="outline-button" onClick={download}>Download Excel Report</button>}</div>
        {message && <p className={message.type === "success" ? "status-ok" : "status-fail"}>{message.text}</p>}
      </section>
      {summary && <>
        <section className="comparison-summary">{[["Modified", summary.modified], ["Added", summary.added], ["Removed", summary.removed], ["Unchanged", summary.unchanged], ["Warnings", summary.warnings]].map(([label, value]) => <article className={`summary-${label.toLowerCase()}`} key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
        <section className="panel-card"><h2>Field-level Results</h2>{comparison.truncated && <p className="catalog-note">The browser view is limited to 5,000 records. The workbook contains the complete comparison.</p>}<div className="history-wrap"><table className="history-table comparison-table"><thead><tr><th>Configuration</th><th>Dataset</th><th>Record Key</th><th>Status</th><th>Field</th><th>Source</th><th>Target</th></tr></thead><tbody>{detailedRows.slice(0, 1000).map((row, index) => <tr key={`${row.configurationName}-${row.recordKey}-${row.field}-${index}`}><td>{row.configurationName}</td><td>{row.dataset}</td><td>{row.recordKey}</td><td><span className={`diff-status diff-${row.status.toLowerCase()}`}>{row.status}</span></td><td>{row.field || "—"}</td><td>{String(row.sourceValue ?? "")}</td><td>{String(row.targetValue ?? "")}</td></tr>)}</tbody></table></div></section>
      </>}
    </>
  );
}

export default CompareView;
