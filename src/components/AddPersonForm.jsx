import React, { useState, useEffect, useRef } from "react";
import { fetchParentCouples, createPerson, uploadPhoto, fetchPersons } from "../utils/api.js";

const GENDER_OPTIONS = [
  { value: "Laki-laki", label: "Laki-laki" },
  { value: "Perempuan", label: "Perempuan" },
];

function AddPersonForm({ onSuccess, onCancel }) {
  const [formData, setFormData] = useState({
    fullName: "",
    waNumber: "",
    gender: "",
    parentCoupleId: "",
    photo: "",
  });

  const [isMarried, setIsMarried] = useState(false);
  const [spouseType, setSpouseType] = useState("new"); // "new" or "existing"
  const [spouseData, setSpouseData] = useState({
    fullName: "",
    waNumber: "",
    gender: "",
    photo: "",
  });
  const [selectedExistingSpouse, setSelectedExistingSpouse] = useState(null);

  const [parentCouples, setParentCouples] = useState([]);
  const [loadingCouples, setLoadingCouples] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const [spousePhotoPreview, setSpousePhotoPreview] = useState("");

  // Search existing persons
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef(null);

  // Fetch parent couples on mount
  useEffect(() => {
    let cancelled = false;
    async function loadCouples() {
      setLoadingCouples(true);
      setError("");
      try {
        const data = await fetchParentCouples();
        if (!cancelled) {
          setParentCouples(Array.isArray(data) ? data : []);
          setLoadingCouples(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Gagal memuat daftar pasangan orang tua.");
          setLoadingCouples(false);
        }
      }
    }
    loadCouples();
    return () => {
      cancelled = true;
    };
  }, []);

  // Handle search existing persons
  useEffect(() => {
    if (spouseType !== "existing" || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await fetchPersons(searchQuery);
        setSearchResults(results || []);
      } catch (e) {
        console.error("Search failed:", e);
      } finally {
        setSearching(false);
      }
    }, 500);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, spouseType]);

  // Handle photo upload
  const handlePhotoChange = async (e, isSpouse = false) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("Ukuran foto maksimal 5MB.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("Format foto harus berupa gambar (JPG, PNG, dll).");
      return;
    }

    try {
      const base64 = await uploadPhoto(file);
      if (isSpouse) {
        setSpousePhotoPreview(base64);
        setSpouseData((prev) => ({ ...prev, photo: base64 }));
      } else {
        setPhotoPreview(base64);
        setFormData((prev) => ({ ...prev, photo: base64 }));
      }
      setError("");
    } catch (e) {
      setError("Gagal mengupload foto.");
    }
  };

  // Handle form submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!formData.parentCoupleId) {
      setError("Pasangan orang tua wajib dipilih.");
      return;
    }

    const selectedCouple = parentCouples.find(
      (c) => c.id === formData.parentCoupleId
    );
    if (!selectedCouple) {
      setError("Pasangan orang tua tidak valid.");
      return;
    }

    if (isMarried) {
      if (spouseType === "new" && !spouseData.fullName) {
        setError("Nama lengkap pasangan wajib diisi.");
        return;
      }
      if (spouseType === "existing" && !selectedExistingSpouse) {
        setError("Silakan pilih anggota yang sudah terdaftar sebagai pasangan.");
        return;
      }
    }

    setLoading(true);

    try {
      const payload = {
        full_name: formData.fullName,
        gender: formData.gender || undefined,
        wa_number: formData.waNumber || undefined,
        url: formData.photo || undefined,
        father_id: selectedCouple.father_id,
        mother_id: selectedCouple.mother_id,
      };

      if (isMarried) {
        if (spouseType === "new") {
          payload.spouse = {
            full_name: spouseData.fullName,
            gender: spouseData.gender || undefined,
            wa_number: spouseData.waNumber || undefined,
            url: spouseData.photo || undefined,
          };
        } else {
          payload.spouse_id = selectedExistingSpouse.id;
        }
      }

      await createPerson(payload);

      setLoading(false);
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menambahkan anggota keluarga.");
      setLoading(false);
    }
  };

  const handleRemovePhoto = (isSpouse = false) => {
    if (isSpouse) {
      setSpouseData((prev) => ({ ...prev, photo: "" }));
      setSpousePhotoPreview("");
    } else {
      setFormData((prev) => ({ ...prev, photo: "" }));
      setPhotoPreview("");
    }
  };

  const isFormValid = formData.fullName && formData.parentCoupleId && 
    (!isMarried || (spouseType === "new" ? spouseData.fullName : !!selectedExistingSpouse));

  if (loadingCouples) {
    return (
      <div className="add-person-loading">
        <div className="spinner" />
        <span>Memuat daftar pasangan orang tua...</span>
      </div>
    );
  }

  return (
    <form className="add-person-form" onSubmit={handleSubmit}>
      <h3 className="add-person-title">Tambah Anggota Keluarga</h3>

      {error && <div className="add-person-error">{error}</div>}

      <div className="form-section">
        <h4 className="section-title">Data Anggota Baru (Keturunan Langsung)</h4>
        <div className="add-person-field">
          <label htmlFor="fullName">Nama Lengkap <span className="required">*</span></label>
          <input
            id="fullName"
            type="text"
            value={formData.fullName}
            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
            placeholder="Masukkan nama lengkap..."
            required
          />
        </div>

        <div className="add-person-field">
          <label htmlFor="waNumber">Nomor WhatsApp</label>
          <input
            id="waNumber"
            type="tel"
            value={formData.waNumber}
            onChange={(e) => setFormData({ ...formData, waNumber: e.target.value })}
            placeholder="Contoh: 081234567890"
          />
        </div>

        <div className="add-person-field">
          <label htmlFor="gender">Jenis Kelamin</label>
          <select
            id="gender"
            value={formData.gender}
            onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
          >
            <option value="">Pilih jenis kelamin...</option>
            {GENDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="add-person-field">
          <label htmlFor="parentCouple">Pasangan Orang Tua <span className="required">*</span></label>
          <select
            id="parentCouple"
            value={formData.parentCoupleId}
            onChange={(e) => setFormData({ ...formData, parentCoupleId: e.target.value })}
            required
            disabled={parentCouples.length === 0}
          >
            <option value="">Pilih pasangan orang tua...</option>
            {parentCouples.map((couple) => (
              <option key={couple.id} value={couple.id}>
                {couple.couple_name} {couple.children_count > 0 && ` (${couple.children_count} anak)`}
              </option>
            ))}
          </select>
        </div>

        <div className="add-person-field">
          <label>Foto Profil</label>
          <div className="photo-upload-container">
            {photoPreview ? (
              <div className="photo-preview">
                <img src={photoPreview} alt="Preview" />
                <button type="button" className="photo-remove-btn" onClick={() => handleRemovePhoto(false)}>×</button>
              </div>
            ) : (
              <label htmlFor="photo" className="photo-upload-label">
                <span>📷 Upload Foto</span>
              </label>
            )}
            <input id="photo" type="file" accept="image/*" onChange={(e) => handlePhotoChange(e, false)} style={{ display: "none" }} />
          </div>
        </div>
      </div>

      <div className="married-toggle-field">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={isMarried}
            onChange={(e) => setIsMarried(e.target.checked)}
          />
          <span>Sudah Menikah?</span>
        </label>
      </div>

      {isMarried && (
        <div className="form-section spouse-section">
          <h4 className="section-title">Data Pasangan</h4>
          
          <div className="spouse-type-selector">
            <label className="radio-label">
              <input 
                type="radio" 
                name="spouseType" 
                value="new" 
                checked={spouseType === "new"} 
                onChange={() => setSpouseType("new")} 
              />
              <span>Pasangan Baru (Mantu)</span>
            </label>
            <label className="radio-label">
              <input 
                type="radio" 
                name="spouseType" 
                value="existing" 
                checked={spouseType === "existing"} 
                onChange={() => setSpouseType("existing")} 
              />
              <span>Dari Anggota Terdaftar</span>
            </label>
          </div>

          {spouseType === "new" ? (
            <>
              <div className="add-person-field">
                <label htmlFor="spouseFullName">Nama Lengkap Pasangan <span className="required">*</span></label>
                <input
                  id="spouseFullName"
                  type="text"
                  value={spouseData.fullName}
                  onChange={(e) => setSpouseData({ ...spouseData, fullName: e.target.value })}
                  placeholder="Nama lengkap pasangan..."
                  required={isMarried && spouseType === "new"}
                />
              </div>

              <div className="add-person-field">
                <label htmlFor="spouseWaNumber">Nomor WA Pasangan</label>
                <input
                  id="spouseWaNumber"
                  type="tel"
                  value={spouseData.waNumber}
                  onChange={(e) => setSpouseData({ ...spouseData, waNumber: e.target.value })}
                  placeholder="Contoh: 081234567890"
                />
              </div>

              <div className="add-person-field">
                <label htmlFor="spouseGender">Jenis Kelamin Pasangan</label>
                <select
                  id="spouseGender"
                  value={spouseData.gender}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSpouseData({ ...spouseData, gender: val });
                    if (val === "Laki-laki" && !formData.gender) setFormData(p => ({ ...p, gender: "Perempuan" }));
                    if (val === "Perempuan" && !formData.gender) setFormData(p => ({ ...p, gender: "Laki-laki" }));
                  }}
                >
                  <option value="">Pilih jenis kelamin...</option>
                  {GENDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="add-person-field">
                <label>Foto Pasangan</label>
                <div className="photo-upload-container">
                  {spousePhotoPreview ? (
                    <div className="photo-preview">
                      <img src={spousePhotoPreview} alt="Preview" />
                      <button type="button" className="photo-remove-btn" onClick={() => handleRemovePhoto(true)}>×</button>
                    </div>
                  ) : (
                    <label htmlFor="spousePhoto" className="photo-upload-label">
                      <span>📷 Upload Foto Pasangan</span>
                    </label>
                  )}
                  <input id="spousePhoto" type="file" accept="image/*" onChange={(e) => handlePhotoChange(e, true)} style={{ display: "none" }} />
                </div>
              </div>
            </>
          ) : (
            <div className="existing-spouse-search">
              <div className="add-person-field">
                <label>Cari Nama Anggota</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ketik nama anggota..."
                />
              </div>

              {searching && <div className="search-hint">Mencari...</div>}
              
              {!searching && searchResults.length > 0 && (
                <div className="search-results-list">
                  {searchResults.map(p => (
                    <div 
                      key={p.id} 
                      className={`search-result-item ${selectedExistingSpouse?.id === p.id ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedExistingSpouse(p);
                        if (p.gender === "Laki-laki" && !formData.gender) setFormData(prev => ({ ...prev, gender: "Perempuan" }));
                        if (p.gender === "Perempuan" && !formData.gender) setFormData(prev => ({ ...prev, gender: "Laki-laki" }));
                      }}
                    >
                      <div className="item-name">{p.full_name}</div>
                      <div className="item-details">{p.gender} • {p.wa_number || "Tanpa WA"}</div>
                    </div>
                  ))}
                </div>
              )}

              {selectedExistingSpouse && (
                <div className="selected-spouse-info">
                  Terpilih: <strong>{selectedExistingSpouse.full_name}</strong>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="add-person-actions">
        <button type="submit" className="add-person-submit" disabled={!isFormValid || loading}>
          {loading ? "Menyimpan..." : "Simpan"}
        </button>
        <button type="button" className="add-person-cancel" onClick={onCancel} disabled={loading}>
          Batal
        </button>
      </div>
    </form>
  );
}

export default AddPersonForm;
