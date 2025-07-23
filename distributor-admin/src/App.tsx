import { useEffect, useState } from "react";

function App() {
  const [distributors, setDistributors] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [globalRules, setGlobalRules] = useState<any[]>([]);

  useEffect(() => {
    fetch("http://localhost:3001/partners/global-rules")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setGlobalRules(data);
        else if (Array.isArray(data.rules)) setGlobalRules(data.rules);
        else setGlobalRules([]);
      });

    fetch("http://localhost:3001/partners/distributors")
      .then((res) => res.json())
      .then((data) => {
        const distList = Array.isArray(data) ? data : data.distributors;
        setDistributors(distList || []);
      });
  }, []);

  useEffect(() => {
    if (!selected) {
      setRules([]);
      return;
    }
    fetch(`http://localhost:3001/partners/distributors/${selected}/rules`)
      .then((res) => res.json())
      .then((rulesList) => {
        let rulesArr: any[] = [];
        if (Array.isArray(rulesList)) rulesArr = rulesList;
        else if (Array.isArray(rulesList.rules)) rulesArr = rulesList.rules;
        setRules(rulesArr);
      })
      .catch(() => setRules([]));
  }, [selected]);

  return (
    <div
      style={{ maxWidth: 800, margin: "40px auto", fontFamily: "sans-serif" }}
    >
      <h1
        style={{
          textAlign: "left",
          fontWeight: 700,
          fontSize: "2rem",
          marginBottom: 24,
        }}
      >
        Distributors
      </h1>
      <table
        style={{ width: "100%", borderCollapse: "collapse", marginBottom: 32 }}
      >
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 8 }}>Name</th>
            <th style={{ textAlign: "left", padding: 8 }}>UUID</th>
            <th style={{ textAlign: "left", padding: 8 }}>Rules</th>
          </tr>
        </thead>
        <tbody>
          {distributors.map((d) => (
            <tr key={d.uuid}>
              <td style={{ textAlign: "left", padding: 8 }}>
                <button
                  style={{
                    background: "none",
                    border: 0,
                    color: "#1a73e8",
                    cursor: "pointer",
                    padding: 0,
                    fontSize: "inherit",
                    fontFamily: "inherit",
                    textDecoration: selected === d.uuid ? "underline" : "none",
                  }}
                  onClick={() =>
                    setSelected(selected === d.uuid ? null : d.uuid)
                  }
                >
                  {d.name}
                </button>
              </td>
              <td style={{ textAlign: "left", padding: 8 }}>{d.uuid}</td>
              <td style={{ textAlign: "left", padding: 8 }}>
                {selected === d.uuid ? (
                  rules.length > 0 ? (
                    <ul
                      style={{
                        margin: 0,
                        padding: 0,
                        listStyle: "disc inside",
                      }}
                    >
                      {rules.map((r) => (
                        <li key={r.key}>
                          <b>{r.key}:</b> {String(r.value)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span style={{ color: "#aaa" }}>No rules</span>
                  )
                ) : (
                  <span style={{ color: "#aaa" }}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2
        style={{
          textAlign: "left",
          fontWeight: 700,
          fontSize: "1.2rem",
          marginBottom: 12,
        }}
      >
        Global Rules
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 8 }}>Key</th>
            <th style={{ textAlign: "left", padding: 8 }}>Value</th>
          </tr>
        </thead>
        <tbody>
          {Array.isArray(globalRules) && globalRules.length > 0 ? (
            globalRules.map((r) => (
              <tr key={r.key}>
                <td style={{ textAlign: "left", padding: 8 }}>{r.key}</td>
                <td style={{ textAlign: "left", padding: 8 }}>
                  {String(r.value)}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={2} style={{ color: "#aaa", padding: 8 }}>
                No global rules
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default App;
