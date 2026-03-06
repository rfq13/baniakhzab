import React, { useState, useEffect } from "react";
import { getAuthHeaders } from "../utils/auth";
import { X, Save, Phone, Mail } from "lucide-react";

export default function AdminSettingsModal({ onClose }) {
    const [whatsapp, setWhatsapp] = useState("");
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);

    // Fetch current settings
    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await fetch("/api/v1/settings/landing");
                if (response.ok) {
                    const data = await response.json();
                    setWhatsapp(data.whatsapp || "");
                    setEmail(data.email || "");
                } else {
                    setError("Gagal mengambil pengaturan saat ini.");
                }
            } catch (err) {
                setError("Terjadi kesalahan jaringan.");
            } finally {
                setInitialLoading(false);
            }
        };

        fetchSettings();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setSuccess(false);

        try {
            const response = await fetch("/api/v1/settings/landing", {
                method: "PUT",
                headers: {
                    ...getAuthHeaders(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    whatsapp: whatsapp.trim() || "",
                    email: email.trim() || "",
                }),
            });

            if (response.ok) {
                setSuccess(true);
                setTimeout(() => onClose(), 1500); // Auto close after success
            } else {
                const data = await response.json();
                setError(data.error || "Gagal menyimpan pengaturan.");
            }
        } catch (err) {
            setError("Terjadi kesalahan jaringan.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-wrapper">
                <div className="modal-content" style={{ maxWidth: '500px' }}>
                    <div className="modal-header">
                        <h2>Pengaturan Landing Page</h2>
                        <button className="close-btn" onClick={onClose}>
                            <X size={20} />
                        </button>
                    </div>

                    <div className="modal-body">
                        {initialLoading ? (
                            <div style={{ textAlign: 'center', padding: '2rem' }}>
                                <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
                                <p>Memuat pengaturan...</p>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="form-container">
                                {error && <div className="error-message">{error}</div>}
                                {success && (
                                    <div className="success-message" style={{ backgroundColor: '#d1fae5', color: '#065f46', padding: '0.75rem', borderRadius: '0.375rem', marginBottom: '1rem', border: '1px solid #34d399' }}>
                                        Pengaturan berhasil disimpan!
                                    </div>
                                )}

                                <div className="form-group">
                                    <label htmlFor="whatsapp">
                                        <Phone size={16} style={{ display: 'inline-block', marginRight: '8px', verticalAlign: 'text-bottom' }} />
                                        Nomor WhatsApp
                                    </label>
                                    <input
                                        type="text"
                                        id="whatsapp"
                                        value={whatsapp}
                                        onChange={(e) => setWhatsapp(e.target.value)}
                                        placeholder="Contoh: 6281234567890"
                                        className="form-input"
                                    />
                                    <small style={{ display: 'block', marginTop: '4px', color: '#6b7280' }}>
                                        Format menggunakan kode negara tanpa tanda '+' (contoh: 62).
                                    </small>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="email">
                                        <Mail size={16} style={{ display: 'inline-block', marginRight: '8px', verticalAlign: 'text-bottom' }} />
                                        Alamat Email
                                    </label>
                                    <input
                                        type="email"
                                        id="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="Contoh: admin@baniakhzab.com"
                                        className="form-input"
                                    />
                                </div>

                                <div className="modal-footer" style={{ marginTop: '2rem' }}>
                                    <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
                                        Batal
                                    </button>
                                    <button type="submit" className="btn-primary" disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Save size={16} />
                                        {loading ? "Menyimpan..." : "Simpan Pengaturan"}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
