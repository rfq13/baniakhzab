import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchParentCouples,
  updatePerson,
  getPerson,
  uploadPersonPhoto,
} from '../utils/api.js';

const GENDER_OPTIONS = [
  { value: 'Laki-laki', label: 'Laki-laki' },
  { value: 'Perempuan', label: 'Perempuan' },
];

function EditPersonForm({ personId, onSuccess, onCancel }) {
  const [formData, setFormData] = useState({
    fullName: '',
    waNumber: '',
    gender: '',
    parentCoupleId: '',
    imgUrl: '',
  });

  const [parentCouples, setParentCouples] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      setLoadingInitial(true);
      setError('');
      try {
        const [couplesData, personData] = await Promise.all([
          fetchParentCouples(),
          getPerson(personId),
        ]);

        if (!cancelled) {
          const couples = Array.isArray(couplesData) ? couplesData : [];
          setParentCouples(couples);

          // Find initial couple ID if they have parents
          let initialCoupleId = '';
          if (personData.father_id || personData.mother_id) {
            const match = couples.find(
              (c) =>
                c.father_id === personData.father_id ||
                c.mother_id === personData.mother_id
            );
            if (match) {
              initialCoupleId = match.id;
            }
          }

          setFormData({
            fullName: personData.full_name || personData.name || '',
            waNumber: personData.wa_number || '',
            gender: personData.gender || '',
            parentCoupleId: initialCoupleId,
            imgUrl: personData.img_url || '',
          });
          setLoadingInitial(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error
              ? e.message
              : 'Gagal memuat data anggota keluarga.'
          );
          setLoadingInitial(false);
        }
      }
    }
    if (personId) {
      loadData();
    }
    return () => {
      cancelled = true;
    };
  }, [personId]);

  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setError('');

      if (!formData.fullName.trim()) {
        setError('Nama Lengkap wajib diisi.');
        return;
      }

      let father_id = undefined;
      let mother_id = undefined;

      if (formData.parentCoupleId) {
        const selectedCouple = parentCouples.find(
          (c) => c.id === formData.parentCoupleId
        );
        if (selectedCouple) {
          father_id = selectedCouple.father_id;
          mother_id = selectedCouple.mother_id;
        }
      }

      setLoading(true);

      try {
        const personDataPayload = {
          full_name: formData.fullName,
          gender: formData.gender || undefined,
          wa_number: formData.waNumber || undefined,
          father_id: father_id,
          mother_id: mother_id,
          img_url: formData.imgUrl || undefined,
        };

        await updatePerson(personId, personDataPayload);

        setLoading(false);
        onSuccess?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Gagal menyimpan perubahan.');
        setLoading(false);
      }
    },
    [personId, formData, parentCouples, onSuccess]
  );

  const handlePhotoChange = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const url = await uploadPersonPhoto(file);
      setFormData((prev) => ({ ...prev, imgUrl: url }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunggah foto.');
    } finally {
      setUploading(false);
    }
  }, []);

  const isFormValid = !!formData.fullName.trim();

  if (loadingInitial) {
    return (
      <div className="add-person-loading">
        <div className="spinner" />
        <span>Memuat data...</span>
      </div>
    );
  }

  return (
    <form className="add-person-form" onSubmit={handleSubmit}>
      <h3 className="add-person-title">Edit Data Anggota Keluarga</h3>

      {error && <div className="add-person-error">{error}</div>}

      <div className="add-person-field">
        <label>Foto Profil</label>
        <div className="photo-upload-container">
          {formData.imgUrl ? (
            <div className="photo-preview">
              <img src={formData.imgUrl} alt="Foto profil" />
              <button
                type="button"
                className="photo-remove-btn"
                onClick={() => setFormData({ ...formData, imgUrl: '' })}
                title="Hapus foto"
              >
                &times;
              </button>
            </div>
          ) : (
            <label className="photo-upload-label">
              <span>{uploading ? 'Mengunggah...' : 'Pilih Foto'}</span>
              <span className="photo-hint">JPG, PNG, atau WebP (maks 5MB)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoChange}
                disabled={uploading}
                style={{ display: 'none' }}
              />
            </label>
          )}
        </div>
      </div>

      <div className="add-person-field">
        <label htmlFor="fullName">
          Nama Lengkap <span className="required">*</span>
        </label>
        <input
          id="fullName"
          type="text"
          value={formData.fullName}
          onChange={(e) =>
            setFormData({ ...formData, fullName: e.target.value })
          }
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
          onChange={(e) =>
            setFormData({ ...formData, waNumber: e.target.value })
          }
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
          <option value="">Tidak ditentukan</option>
          {GENDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="add-person-field">
        <label htmlFor="parentCouple">Pasangan Orang Tua</label>
        <select
          id="parentCouple"
          value={formData.parentCoupleId}
          onChange={(e) =>
            setFormData({ ...formData, parentCoupleId: e.target.value })
          }
          disabled={parentCouples.length === 0}
        >
          <option value="">Pilih pasangan orang tua (opsional)...</option>
          {parentCouples.map((couple) => (
            <option key={couple.id} value={couple.id}>
              {couple.couple_name}
            </option>
          ))}
        </select>
        {parentCouples.length === 0 && (
          <div className="add-person-hint">
            Tidak ada pasangan orang tua yang terdaftar di sistem.
          </div>
        )}
      </div>

      <div className="add-person-actions">
        <button
          type="submit"
          className="add-person-submit"
          disabled={!isFormValid || loading}
        >
          {loading ? 'Menyimpan...' : 'Simpan Perubahan'}
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

export default EditPersonForm;
