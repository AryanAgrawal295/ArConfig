import React, { useEffect, useState } from "react";
import axios from "axios";

const EMPTY = { name: "", environmentType: "DEV", baseUrl: "", username: "", password: "" };

function EnvironmentManager({ onChanged }) {
  const [connections, setConnections] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const load = async () => {
    try {
      const response = await axios.get("/api/environments");
      setConnections(response.data.connections || []);
      if (onChanged) onChanged(response.data.connections || []);
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.error || error.message });
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (event) => {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      await axios.post("/api/environments", form);
      setForm(EMPTY);
      setMessage({ type: "success", text: "Environment saved securely." });
      await load();
    } catch (error) {
      setMessage({ type: "error", text: error.response?.data?.error || error.message });
    } finally { setBusy(false); }
  };

  const test = async (id) => {
    setBusy(true); setMessage(null);
    try {
      const response = await axios.post(`/api/environments/${id}/test`);
      setMessage({ type: response.data.ok ? "success" : "error", text: response.data.ok ? "Connection is healthy." : response.data.error });
      await load();
    } catch (error) { setMessage({ type: "error", text: error.response?.data?.error || error.message }); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    setBusy(true); setMessage(null);
    try { await axios.delete(`/api/environments/${id}`); await load(); }
    catch (error) { setMessage({ type: "error", text: error.response?.data?.error || error.message }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <form className="environment-form" onSubmit={save}>
        <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Finance DEV" required /></label>
        <label>Type<select value={form.environmentType} onChange={(event) => setForm({ ...form, environmentType: event.target.value })}>{["DEV", "SIT", "UAT", "PROD", "OTHER"].map((type) => <option key={type}>{type}</option>)}</select></label>
        <label>Fusion URL<input type="url" value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} placeholder="https://instance.oraclecloud.com" required /></label>
        <label>Username<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required /></label>
        <label>Password<input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} autoComplete="new-password" required /></label>
        <button type="submit" disabled={busy}>{busy ? "Working..." : "Save Environment"}</button>
      </form>
      {message && <p className={message.type === "success" ? "status-ok" : "status-fail"}>{message.text}</p>}
      <div className="environment-list">
        {connections.map((connection) => (
          <article key={connection._id}>
            <div><strong>{connection.name}</strong><small>{connection.environmentType} · {connection.baseUrl} · {connection.username}</small></div>
            <span className={`connection-health health-${String(connection.status).toLowerCase()}`}>{connection.status}</span>
            <button className="outline-button compact-button" type="button" onClick={() => test(connection._id)} disabled={busy}>Test</button>
            <button className="danger-button compact-button" type="button" onClick={() => remove(connection._id)} disabled={busy}>Delete</button>
          </article>
        ))}
        {!connections.length && <p className="empty-state">No saved environments. Add DEV, SIT, UAT, or PROD above to enable comparison.</p>}
      </div>
    </>
  );
}

export default EnvironmentManager;
