import { useEffect, useState } from "react";

function App() {
  const [distributors, setDistributors] = useState<any[]>([]);
  useEffect(() => {
    fetch("http://localhost:3001/partners/distributors")
      .then((res) => res.json())
      .then((data) => setDistributors(data.distributors));
  }, []);

  return (
    <div style={{ maxWidth: 480, margin: "40px auto", fontFamily: "sans-serif" }}>
      <h1>Distributors</h1>
      <ul>
        {distributors.map((d) => (
          <li key={d.uuid}>
            <b>{d.name}</b> <span style={{ color: "#888" }}>{d.uuid}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;
