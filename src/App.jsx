import React, { useMemo, useState, useRef } from 'react';
import FamilyTree from './components/FamilyTree.jsx';
import Login from './components/Login.jsx';
import AddPersonModal from './components/AddPersonModal.jsx';
import WhatsAppPanel from './components/WhatsAppPanel.jsx';
import WhatsAppSetup from './components/WhatsAppSetup.jsx';
import AdminSettingsModal from './components/AdminSettingsModal.jsx';
import EditPersonModal from './components/EditPersonModal.jsx';
import useOrgData from './hooks/useOrgData.js';
import { buildFamilyTree, normalizePersons } from './utils/buildFamilyTree.js';

const EXPORT_SIZES = ['A4', 'A3', 'A2'];

function ActionSheet({
  open, onClose, ftRef, selectedId,
  onAddPerson, onEditPerson, onAdminSettings, onWhatsApp,
  searchTerm, setSearchTerm, searchResults, onSelectPerson,
}) {
  const [exportSize, setExportSize] = useState('A3');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const handleExport = async (format) => {
    if (!ftRef.current) return;
    setExporting(true);
    setExportError('');
    try {
      ftRef.current.setExportSize(exportSize);
      await ftRef.current.handleExport(format);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Gagal ekspor.');
    } finally {
      setExporting(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="ft-action-sheet-backdrop" onClick={onClose} />
      <div className="ft-action-sheet open" role="dialog" aria-modal="true">
        <div className="ft-action-sheet-handle" />

        <div className="ft-action-section">
          <div className="ft-action-section-header">Cari Anggota</div>
          <div className="ft-action-search">
            <input
              className="ft-action-search-input"
              type="text"
              value={searchTerm}
              placeholder="Ketik nama..."
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchResults.length > 0 && (
              <div className="ft-action-search-results">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="ft-action-search-result"
                    onClick={() => { onSelectPerson(p.id); setSearchTerm(''); onClose(); }}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="ft-action-section">
          <div className="ft-action-section-header">Anggota</div>
          <button type="button" className="ft-action-item" onClick={() => { onAddPerson(); onClose(); }}>
            <span className="ft-action-item-icon">+</span>
            <span>Tambah Anggota Baru</span>
          </button>
          <button
            type="button"
            className={"ft-action-item" + (!selectedId ? " disabled" : "")}
            disabled={!selectedId}
            onClick={() => { if (selectedId) { onEditPerson(); onClose(); } }}
          >
            <span className="ft-action-item-icon">Ed</span>
            <span>Edit Anggota{!selectedId ? " (pilih dari pohon dulu)" : ""}</span>
          </button>
        </div>

        <div className="ft-action-section">
          <div className="ft-action-section-header">Tampilan</div>
          <button type="button" className="ft-action-item" onClick={() => { ftRef.current?.openFilter(); onClose(); }}>
            <span className="ft-action-item-icon">Ft</span>
            <span>Filter Silsilah</span>
          </button>
          <button type="button" className="ft-action-item" onClick={() => { ftRef.current?.openRelation(); onClose(); }}>
            <span className="ft-action-item-icon">Hb</span>
            <span>Cari Hubungan Antar Anggota</span>
          </button>
          <button type="button" className="ft-action-item" onClick={() => { ftRef.current?.zoomReset(); onClose(); }}>
            <span className="ft-action-item-icon">Rs</span>
            <span>Reset Zoom &amp; Posisi</span>
          </button>
        </div>

        <div className="ft-action-section">
          <div className="ft-action-section-header">Export</div>
          <div className="ft-action-export-row">
            <span className="ft-action-export-label">Ukuran:</span>
            {EXPORT_SIZES.map((s) => (
              <button key={s} type="button" className={"ft-action-size-btn" + (exportSize === s ? " active" : "")} onClick={() => setExportSize(s)}>{s}</button>
            ))}
          </div>
          {exportError && <div className="ft-action-export-error">{exportError}</div>}
          <button type="button" className="ft-action-item" disabled={exporting} onClick={() => handleExport('png')}>
            <span className="ft-action-item-icon">Img</span>
            <span>{exporting ? "Mengekspor..." : "Export PNG (" + exportSize + ")"}</span>
          </button>
          <button type="button" className="ft-action-item" disabled={exporting} onClick={() => handleExport('svg')}>
            <span className="ft-action-item-icon">Svg</span>
            <span>{exporting ? "Mengekspor..." : "Export SVG (" + exportSize + ")"}</span>
          </button>
        </div>

        <div className="ft-action-section">
          <div className="ft-action-section-header">Admin</div>
          <button type="button" className="ft-action-item" onClick={() => { onAdminSettings(); onClose(); }}>
            <span className="ft-action-item-icon">Cfg</span>
            <span>Pengaturan Landing</span>
          </button>
          <button type="button" className="ft-action-item" onClick={() => { onWhatsApp(); onClose(); }}>
            <span className="ft-action-item-icon">WA</span>
            <span>WhatsApp Admin</span>
          </button>
        </div>

        <div style={{ height: '16px' }} />
      </div>
    </>
  );
}

export default function App() {
  const { data, loading, error, authRedirect, refresh } = useOrgData();
  const [searchTerm, setSearchTerm] = useState('');
  const [showWhatsAppPanel, setShowWhatsAppPanel] = useState(false);
  const [showAdminSettings, setShowAdminSettings] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditPersonModal, setShowEditPersonModal] = useState(false);
  const [showActionSheet, setShowActionSheet] = useState(false);
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
  const ftRef = useRef(null);

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

  const allPersons = useMemo(() => {
    if (!data) return [];
    return data.map((p) => ({ id: String(p.id), name: p.name || '' }));
  }, [data]);

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return allPersons.filter((p) => p.name.toLowerCase().includes(term)).slice(0, 10);
  }, [allPersons, searchTerm]);

  const highlightedIds = useMemo(() => {
    const ids = new Set();
    if (selectedId) ids.add(selectedId);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      allPersons.forEach((p) => { if (p.name.toLowerCase().includes(term)) ids.add(p.id); });
    }
    return ids;
  }, [allPersons, searchTerm, selectedId]);

  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('setup') === '1') return <WhatsAppSetup />;
    if (params.get('token') || authRedirect) return <Login />;
  }

  return (
    <div className="app-shell">
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
        {!loading && !error && !treeResult.error && treeResult.roots && treeResult.persons && (
          <FamilyTree
            ref={ftRef}
            roots={treeResult.roots}
            persons={treeResult.persons}
            highlightedIds={highlightedIds}
            onSelectPerson={setSelectedId}
            selectedId={selectedId}
            onAddPerson={() => setShowAddModal(true)}
          />
        )}

        <button
          type="button"
          className="ft-action-fab"
          onClick={() => setShowActionSheet(true)}
          aria-label="Menu"
        >
          &#9776;
        </button>

        <ActionSheet
          open={showActionSheet}
          onClose={() => setShowActionSheet(false)}
          ftRef={ftRef}
          selectedId={selectedId}
          onAddPerson={() => setShowAddModal(true)}
          onEditPerson={() => setShowEditPersonModal(true)}
          onAdminSettings={() => setShowAdminSettings(true)}
          onWhatsApp={() => setShowWhatsAppPanel(true)}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          searchResults={searchResults}
          onSelectPerson={setSelectedId}
        />

        {showWhatsAppPanel && <WhatsAppPanel onClose={() => setShowWhatsAppPanel(false)} />}
        {showAdminSettings && <AdminSettingsModal onClose={() => setShowAdminSettings(false)} />}
        {showEditPersonModal && selectedId && (
          <EditPersonModal
            personId={selectedId}
            onClose={() => setShowEditPersonModal(false)}
            onSuccess={() => { setShowEditPersonModal(false); refresh(); }}
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