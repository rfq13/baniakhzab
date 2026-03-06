import React, { useState, useEffect, useCallback } from "react";
import { fetchParentCouples, createPerson, uploadPhoto } from "../utils/api.js";

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

  const [parentCouples, setParentCouples] = useState([]);
  const [loadingCouples, setLoadingCouples] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");

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

  // Handle photo upload
  const handlePhotoChange = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError("Ukuran foto maksimal 5MB.");
      return;
    }

    // Validate file type
    if (!file.type.startsWith("image/")) {
      setError("Format foto harus berupa gambar (JPG, PNG, dll).");
      return;
    }

    try {
      const base64 = await uploadPhoto(file);
      setPhotoPreview(base64);
      setFormData((prev) => ({ ...prev, photo: base64 }));
      setError("");
    } catch (e) {
      setError("Gagal mengupload foto.");
    }
  }, []);

  // Handle form submit
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError("");

    // Validation: parent couple is required
    if (!formData.parentCoupleId) {
      setError("Pasangan orang tua wajib dipilih.");
      return;
    }

    // Find selected parent couple
    const selectedCouple = parentCouples.find(
      (c) => c.id === formData.parentCoupleId
    );
    if (!selectedCouple) {
      setError("Pasangan orang tua tidak valid.");
      return;
    }

    setLoading(true);

    try {
      const personData = {
        full_name: formData.fullName,
        gender: formData.gender || undefined,
        wa_number: formData.waNumber || undefined,
        url: formData.photo || undefined,
        father_id: selectedCouple.father_id,
        mother_id: selectedCouple.mother_id,
      };

      await createPerson(personData);

      setLoading(false);
      // Reset form
      setFormData({
        fullName: "",
        waNumber: "",
        gender: "",
        parentCoupleId: "",
        photo: "",
      });
      setPhotoPreview("");
      onSuccess?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menambahkan anggota keluarga.");
      setLoading(false);
    }
  }, [formData, parentCouples, onSuccess]);

  // Remove photo
  const handleRemovePhoto = () => {
    setFormData((prev) => ({ ...prev, photo: "" }));
    setPhotoPreview("");
  };

  const isFormValid = formData.fullName && formData.parentCoupleId;

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

      <div className="add-person-field">
        <label htmlFor="fullName">
          Nama Lengkap <span className="required">*</span>
        </label>
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
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="add-person-field">
        <label htmlFor="parentCouple">
          Pasangan Orang Tua <span className="required">*</span>
        </label>
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
              {couple.couple_name}
              {couple.children_count > 0 && ` (${couple.children_count} anak)`}
            </option>
          ))}
        </select>
        {parentCouples.length === 0 && (
          <div className="add-person-hint">
            Tidak ada pasangan orang tua yang terdaftar di sistem.
          </div>
        )}
      </div>

      <div className="add-person-field">
        <label htmlFor="photo">Foto</label>
        <div className="photo-upload-container">
          {photoPreview ? (
            <div className="photo-preview">
              <img src={photoPreview} alt="Preview" />
              <button
                type="button"
                className="photo-remove-btn"
                onClick={handleRemovePhoto}
                title="Hapus foto"
              >
                ×
              </button>
            </div>
          ) : (
            <label htmlFor="photo" className="photo-upload-label">
              <span>📷 Upload Foto</span>
              <span className="photo-hint">(Opsional, maks 5MB)</span>
            </label>
          )}
          <input
            id="photo"
            type="file"
            accept="image/*"
            onChange={handlePhotoChange}
            style={{ display: "none" }}
          />
        </div>
      </div>

      <div className="add-person-actions">
        <button
          type="submit"
          className="add-person-submit"
          disabled={!isFormValid || loading}
        >
          {loading ? "Menyimpan..." : "Simpan"}
        </button>
        <button
          type="button"
          className="add-person-cancel"
          onClick={onCancel}
          disabled={loading}
        >
          Batal
        </button>
      </div>
    </form>
  );
}

export default AddPersonForm;
