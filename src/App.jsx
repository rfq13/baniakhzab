import React, { useMemo, useState } from 'react';
import FamilyTree from './components/FamilyTree.jsx';
import Login from './components/Login.jsx';
import AddPersonModal from './components/AddPersonModal.jsx';
import WhatsAppPanel from './components/WhatsAppPanel.jsx';
import WhatsAppSetup from './components/WhatsAppSetup.jsx';
import AdminSettingsModal from './components/AdminSettingsModal.jsx';
import EditPersonModal from './components/EditPersonModal.jsx';
import useOrgData from './hooks/useOrgData.js';
import { buildFamilyTree, normalizePersons } from './utils/buildFamilyTree.js';

export default function App() {
  const { data, loading, error, authRedirect, refresh } = useOrgData();
  const [searchTerm, setSearchTerm] = useState('');
  const [showWhatsAppPanel, setShowWhatsAppPanel] = useState(false);
  const [showAdminSettings, setShowAdminSettings] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditPersonModal, setShowEditPersonModal] = useState(false);
  const [showControls, setShowControls] = useState(
    typeof window !== 'undefined' ? window.innerWidth > 640 : true
  );
  const [selectedId, setSelectedId] = useState(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const focusId = params.get('focus_id');
    const a = params.get('a');
    const b = params.get('b');
    if (focusId) return focusId;
    if (a && !b) return a;
    if (b && !a) return b;
    return null;
  });

  const treeResult = useMemo(() => {
    if (!data) return { roots: null, persons: null, error: '' };
    try {
      const persons = normalizePersons(data);
      const roots = buildFamilyTree(data);
      return { roots, persons, error: '' };
    } catch (err) {
      return {
        roots: null,
        persons: null,
        error: err instanceof Error ? err.message : 'Data tidak valid.',
      };
    }
  }, [data]);

  const handleAddPersonSuccess = () => {
    setShowAddModal(false);
    refresh();
  };

  // Flat person list for search — derived directly from raw data
  const allPersons = useMemo(() => {
    if (!data) return [];
    return data.map((p) => ({ id: String(p.id), name: p.name || '' }));
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

  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('setup') === '1') {
      return <WhatsAppSetup />;
    }
    if (params.get('token') || authRedirect) {
      return <Login />;
    }
  }

  return (
    <div className="app-shell">
      <div className="controls-toggle-container">
        <button
          className="btn-toggle-controls"
          onClick={() => setShowControls(!showControls)}
        >
          {showControls
            ? '▼ Sembunyikan Filter & Menu'
            : '▲ Tampilkan Filter & Menu'}
        </button>
      </div>

      <header className={`app-header ${showControls ? '' : 'collapsed-view'}`}>
        <div className="app-header-top">
          <div className="app-header-title">
            <h1>Silsilah Keturunan Bani Akhzab</h1>
            <p>Visualisasi pohon keluarga hierarkis.</p>
          </div>
          <div className="app-header-actions">
            <button
              onClick={() => setShowAdminSettings(true)}
              className="btn-header-outline"
            >
              Pengaturan Landing
            </button>
            <button
              onClick={() => setShowWhatsAppPanel(true)}
              className="btn-header-solid"
            >
              WhatsApp Admin
            </button>
          </div>
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
                    setSearchTerm('');
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
              showControls={showControls}
              onAddPerson={() => setShowAddModal(true)}
            />
          )}

        {selectedId && (
          <button
            className="fab-edit-btn"
            onClick={() => setShowEditPersonModal(true)}
          >
            ✏️ Edit Data
          </button>
        )}

        {showWhatsAppPanel && (
          <WhatsAppPanel onClose={() => setShowWhatsAppPanel(false)} />
        )}

        {showAdminSettings && (
          <AdminSettingsModal onClose={() => setShowAdminSettings(false)} />
        )}

        {showEditPersonModal && selectedId && (
          <EditPersonModal
            personId={selectedId}
            onClose={() => setShowEditPersonModal(false)}
            onSuccess={() => {
              setShowEditPersonModal(false);
              refresh();
            }}
          />
        )}
        {showAddModal && (
          <AddPersonModal
            isOpen={showAddModal}
            onClose={() => setShowAddModal(false)}
            onSuccess={handleAddPersonSuccess}
          />
        )}
      </main>
    </div>
  );
}
