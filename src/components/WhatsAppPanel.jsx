import React, { useState, useEffect } from "react";
import useWhatsAppStatus from "../hooks/useWhatsAppStatus";
import WhatsAppChat from "./WhatsAppChat";

export default function WhatsAppPanel({ onClose }) {
    const [password, setPassword] = useState("");
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    const { is_connected, is_logged_in, loading, error, device_id } = useWhatsAppStatus(isAuthenticated ? password : null);

    const [qrLoading, setQrLoading] = useState(false);
    const [actionError, setActionError] = useState("");
    const [qrCodeData, setQrCodeData] = useState(null);
    const [qrCountdown, setQrCountdown] = useState(0);
    const [phone, setPhone] = useState("");
    const [pairingCode, setPairingCode] = useState("");

    // QR Countdown Timer
    useEffect(() => {
        if (qrCountdown <= 0) return;
        const timer = setInterval(() => {
            setQrCountdown(prev => prev - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [qrCountdown]);

    const handleLogin = (e) => {
        e.preventDefault();
        setIsAuthenticated(true);
    };

    const handleGetQR = async () => {
        setQrLoading(true); setActionError(""); setQrCodeData(null); setPairingCode("");
        try {
            const res = await fetch("/api/v1/whatsapp/setup/qr", {
                headers: { "X-Setup-Password": password }
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            if (data.code !== "SUCCESS" && data.code !== "ALREADY_LOGGED_IN") throw new Error(data.message || "Gagal mendapatkan QR Code");
            if (data.results) {
                setQrCodeData(data.results);
                setQrCountdown(data.results.qr_duration || 40); // default to 40 if not provided
            }
        } catch (err) {
            setActionError(err.message || "Terjadi kesalahan");
        } finally {
            setQrLoading(false);
        }
    };

    const handleGetCode = async () => {
        if (!phone) return;
        setQrLoading(true); setActionError(""); setQrCodeData(null); setPairingCode("");
        try {
            const res = await fetch("/api/v1/whatsapp/setup/code", {
                method: "POST",
                headers: { "X-Setup-Password": password, "Content-Type": "application/json" },
                body: JSON.stringify({ phone })
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            if (data.code !== "SUCCESS") throw new Error(data.message || "Gagal mendapatkan kode peering");
            if (data.results?.pair_code) setPairingCode(data.results.pair_code);
        } catch (err) {
            setActionError(err.message || "Terjadi kesalahan");
        } finally {
            setQrLoading(false);
        }
    };

    const handleLogout = async () => {
        if (!window.confirm("Yakin ingin logout WhatsApp dari server?")) return;
        setActionError("");
        try {
            const res = await fetch("/api/v1/whatsapp/setup/logout", {
                method: "POST",
                headers: { "X-Setup-Password": password }
            });
            if (!res.ok) throw new Error(await res.text());
        } catch (err) {
            setActionError(err.message || "Gagal logout WhatsApp");
        }
    };

    if (!isAuthenticated) {
        return (
            <div style={styles.overlay}>
                <div style={styles.panel}>
                    <div style={styles.header}>
                        <h3>Akses Admin WhatsApp</h3>
                        <button onClick={onClose} style={styles.closeBtn}>&times;</button>
                    </div>
                    <form onSubmit={handleLogin} style={styles.body}>
                        <p style={styles.text}>Masukkan password setup WhatsApp untuk mengakses panel ini.</p>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Password Setup (Bawaan: admin)"
                            style={styles.input}
                        />
                        <button type="submit" style={styles.btnPrimary}>Akses Panel</button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.overlay}>
            <div style={styles.panelLarge}>
                <div style={styles.header}>
                    <h3 style={{ margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
                        WhatsApp Panel
                        {loading && !is_connected ? (
                            <span style={styles.badgeLoading}>Memeriksa...</span>
                        ) : is_logged_in ? (
                            <span style={styles.badgeSuccess}>Terhubung</span>
                        ) : (
                            <span style={styles.badgeDanger}>Terputus</span>
                        )}
                    </h3>
                    <button onClick={onClose} style={styles.closeBtn}>&times;</button>
                </div>

                <div style={styles.bodyScroll}>
                    {error && <div style={styles.alertDanger}>{error}</div>}
                    {actionError && <div style={styles.alertDanger}>{actionError}</div>}

                    {!is_logged_in ? (
                        <div style={styles.setupContainer}>
                            <p style={styles.text}>Aplikasi perlu dihubungkan dengan WhatsApp Bot Anda.</p>

                            <div style={styles.setupOptions}>
                                <div style={styles.card}>
                                    <h4>Metode 1: QR Code</h4>
                                    <button onClick={handleGetQR} disabled={qrLoading} style={styles.btnOutline}>
                                        {qrLoading && !qrCodeData ? "Memuat..." : "Tampilkan QR Code"}
                                    </button>
                                    {qrCodeData && (
                                        <div style={styles.qrContainer}>
                                            <img src={qrCodeData.qr_link} alt="QR Code" style={{ maxWidth: "100%", borderRadius: "8px", opacity: qrCountdown <= 0 ? 0.3 : 1 }} />
                                            {qrCountdown > 0 ? (
                                                <p style={{ fontSize: "11px", color: "#666", fontWeight: "bold" }}>QR Code berlaku {qrCountdown} detik</p>
                                            ) : (
                                                <p style={{ fontSize: "11px", color: "#d32f2f", fontWeight: "bold" }}>QR Code Kedaluwarsa. Silakan muat ulang.</p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div style={styles.card}>
                                    <h4>Metode 2: Pairing Code</h4>
                                    <input
                                        type="text"
                                        value={phone}
                                        onChange={e => setPhone(e.target.value)}
                                        placeholder="Nomor HP bot (contoh: 628123..)"
                                        style={styles.input}
                                    />
                                    <button onClick={handleGetCode} disabled={qrLoading || !phone} style={styles.btnOutline}>
                                        Dapatkan Kode
                                    </button>
                                    {pairingCode && (
                                        <div style={styles.codeContainer}>
                                            <h2 style={{ letterSpacing: "4px", margin: "10px 0" }}>{pairingCode}</h2>
                                            <p style={{ fontSize: "11px" }}>Masukkan kode ini di HP WhatsApp bot.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div style={styles.chatSection}>
                            <WhatsAppChat password={password} isConnected={is_logged_in} />

                            <div style={{ marginTop: "20px", textAlign: "right" }}>
                                <button onClick={handleLogout} style={styles.btnDanger}>Logout Device dari Server</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

const styles = {
    overlay: {
        position: "fixed",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        zIndex: 1000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontFamily: "Inter, -apple-system, sans-serif"
    },
    panel: {
        width: "100%",
        maxWidth: "400px",
        backgroundColor: "#fff",
        borderRadius: "12px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
        overflow: "hidden"
    },
    panelLarge: {
        width: "100%",
        maxWidth: "900px",
        backgroundColor: "#fff",
        borderRadius: "12px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
        overflow: "hidden",
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column"
    },
    header: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "15px 20px",
        borderBottom: "1px solid #eee",
        backgroundColor: "#fafafa"
    },
    closeBtn: {
        background: "none",
        border: "none",
        fontSize: "24px",
        cursor: "pointer",
        color: "#666"
    },
    body: {
        padding: "20px"
    },
    bodyScroll: {
        padding: "20px",
        overflowY: "auto",
        flex: 1
    },
    input: {
        width: "100%",
        boxSizing: "border-box",
        padding: "12px",
        border: "1px solid #ccc",
        borderRadius: "6px",
        marginBottom: "15px",
        fontSize: "14px"
    },
    text: {
        fontSize: "14px",
        color: "#555",
        marginBottom: "20px",
        lineHeight: "1.5"
    },
    btnPrimary: {
        width: "100%",
        padding: "12px",
        backgroundColor: "#2e7d32",
        color: "white",
        border: "none",
        borderRadius: "6px",
        fontSize: "14px",
        fontWeight: "bold",
        cursor: "pointer"
    },
    btnOutline: {
        width: "100%",
        padding: "10px",
        backgroundColor: "transparent",
        color: "#2e7d32",
        border: "1px solid #2e7d32",
        borderRadius: "6px",
        fontSize: "14px",
        cursor: "pointer"
    },
    btnDanger: {
        padding: "10px 15px",
        backgroundColor: "transparent",
        color: "#d32f2f",
        border: "1px solid #d32f2f",
        borderRadius: "6px",
        fontSize: "12px",
        cursor: "pointer"
    },
    badgeSuccess: {
        fontSize: "11px", backgroundColor: "#e8f5e9", color: "#2e7d32",
        padding: "4px 8px", borderRadius: "12px", fontWeight: "normal"
    },
    badgeDanger: {
        fontSize: "11px", backgroundColor: "#ffebee", color: "#c62828",
        padding: "4px 8px", borderRadius: "12px", fontWeight: "normal"
    },
    badgeLoading: {
        fontSize: "11px", backgroundColor: "#f5f5f5", color: "#666",
        padding: "4px 8px", borderRadius: "12px", fontWeight: "normal"
    },
    alertDanger: {
        padding: "10px 15px",
        backgroundColor: "#ffebee",
        color: "#c62828",
        borderRadius: "6px",
        marginBottom: "15px",
        fontSize: "13px"
    },
    setupContainer: {
        padding: "10px"
    },
    setupOptions: {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "20px"
    },
    card: {
        padding: "20px",
        border: "1px solid #eee",
        borderRadius: "8px",
        backgroundColor: "#fafafa",
        textAlign: "center"
    },
    qrContainer: {
        marginTop: "15px",
        padding: "10px",
        backgroundColor: "#fff",
        border: "1px solid #ddd",
        borderRadius: "8px"
    },
    codeContainer: {
        marginTop: "15px",
        padding: "15px",
        backgroundColor: "#e8f5e9",
        color: "#2e7d32",
        border: "1px dashed #2e7d32",
        borderRadius: "8px"
    },
    chatSection: {
        display: "flex",
        flexDirection: "column",
        height: "100%"
    }
};
