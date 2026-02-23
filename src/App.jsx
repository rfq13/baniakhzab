import React, { useMemo, useState } from "react";
import FamilyTree from "./components/FamilyTree.jsx";
import useOrgData from "./hooks/useOrgData.js";
import { buildFamilyTree, normalizePersons } from "./utils/buildFamilyTree.js";

export default function App() {
  const { data, loading, error } = useOrgData();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const treeResult = useMemo(() => {
    if (!data) return { roots: null, persons: null, error: "" };
    try {
      const persons = normalizePersons(data);
      const roots = buildFamilyTree(data);
      return { roots, persons, error: "" };
    } catch (err) {
      return {
        roots: null,
        persons: null,
        error: err instanceof Error ? err.message : "Data tidak valid.",
      };
    }
  }, [data]);

  // Flat person list for search — derived directly from raw data
  const allPersons = useMemo(() => {
    if (!data) return [];
    return data.map((p) => ({ id: String(p.id), name: p.name || "" }));
  }, [data]);

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return allPersons
      .filter((p) => p.name.toLowerCase().includes(term))
      .slice(0, 10);
  }, [allPersons, searchTerm]);

  const highlightedIds = useMemo(() => {
    const ids = new Set();
    if (selectedId) ids.add(selectedId);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      allPersons.forEach((p) => {
        if (p.name.toLowerCase().includes(term)) ids.add(p.id);
      });
    }
    return ids;
  }, [allPersons, searchTerm, selectedId]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>Silsilah Keturunan Bani Akhzab</h1>
          <p>Visualisasi pohon keluarga hierarkis.</p>
        </div>
        <div className="search-panel">
          <label className="search-label" htmlFor="search-input">
            Cari anggota keluarga
          </label>
          <input
            id="search-input"
            className="search-input"
            type="text"
            value={searchTerm}
            placeholder="Ketik nama..."
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="search-result"
                  onClick={() => {
                    setSelectedId(p.id);
                    setSearchTerm("");
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>
      <main className="app-main">
        {loading && (
          <div className="state-box">
            <div className="spinner" />
            <span>Memuat data silsilah...</span>
          </div>
        )}
        {(error || treeResult.error) && (
          <div className="state-box error">
            <strong>Gagal memuat data.</strong>
            <span>{error || treeResult.error}</span>
          </div>
        )}
        {!loading &&
          !error &&
          !treeResult.error &&
          treeResult.roots &&
          treeResult.persons && (
            <FamilyTree
              roots={treeResult.roots}
              persons={treeResult.persons}
              highlightedIds={highlightedIds}
              onSelectPerson={setSelectedId}
              selectedId={selectedId}
            />
          )}
      </main>
    </div>
  );
}
