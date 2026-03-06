import React, { useState } from "react";

export default function WhatsAppSetup() {
    const [password, setPassword] = useState("");
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    const [qrCodeData, setQrCodeData] = useState(null);

    const [phone, setPhone] = useState("");
    const [pairingCode, setPairingCode] = useState("");

    const handleLogin = (e) => {
        e.preventDefault();
        if (password.trim() === "") {
            setErrorMsg("Password setup diperlukan");
            return;
        }
        setErrorMsg("");
        setIsAuthenticated(true);
    };

    const getQR = async () => {
        setLoading(true);
        setErrorMsg("");
        setQrCodeData(null);
        setPairingCode("");
        try {
            const res = await fetch("/api/v1/whatsapp/setup/qr", {
                headers: { "X-Setup-Password": password }
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            if (data.code !== "SUCCESS") throw new Error(data.message || "Gagal mendapatkan QR Code");
            setQrCodeData(data.results);
        } catch (err) {
            setErrorMsg(err.message || "Terjadi kesalahan sistem");
            if (err.message.includes("invalid setup password")) {
                setIsAuthenticated(false);
            }
        } finally {
            setLoading(false);
        }
    };

    const getCode = async () => {
        if (!phone) {
            setErrorMsg("Nomor telepon diperlukan");
            return;
        }
        setLoading(true);
        setErrorMsg("");
        setQrCodeData(null);
        setPairingCode("");
        try {
            const res = await fetch("/api/v1/whatsapp/setup/code", {
                method: "POST",
                headers: {
                    "X-Setup-Password": password,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ phone })
            });
            if (!res.ok) throw new Error(await res.text());
            const data = await res.json();
            if (data.code !== "SUCCESS") throw new Error(data.message || "Gagal mendapatkan kode pairing");
            setPairingCode(data.results.pair_code);
        } catch (err) {
            setErrorMsg(err.message || "Terjadi kesalahan sistem");
            if (err.message.includes("invalid setup password")) {
                setIsAuthenticated(false);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleLogoutWA = async () => {
        if (!window.confirm("Yakin ingin logout WhatsApp dari server?")) return;
        setLoading(true);
        setErrorMsg("");
        setSuccessMsg("");
        try {
            const res = await fetch("/api/v1/whatsapp/setup/logout", {
                method: "POST",
                headers: { "X-Setup-Password": password }
            });
            if (!res.ok) throw new Error(await res.text());
            setSuccessMsg("Berhasil logout WhatsApp.");
            setQrCodeData(null);
            setPairingCode("");
        } catch (err) {
            setErrorMsg(err.message || "Gagal logout WhatsApp");
        } finally {
            setLoading(false);
        }
    };

    if (!isAuthenticated) {
        return (
            <div style={styles.container}>
                <div style={styles.card}>
                    <h2 style={{ marginTop: 0, color: "#333" }}>Pengaturan WhatsApp</h2>
                    <p style={styles.subtext}>Masukkan password setup WhatsApp.</p>
                    <form onSubmit={handleLogin}>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Setup Password"
                            style={styles.input}
                        />
                        {errorMsg && <p style={styles.error}>{errorMsg}</p>}
                        <button type="submit" style={{ ...styles.button, width: '100%' }}>Akses Pengaturan</button>
                    </form>
                    <div style={{ marginTop: "20px", textAlign: "center" }}>
                        <a href="/" style={{ color: "#aaa", fontSize: "12px", textDecoration: "none" }}>Kembali ke Aplikasi</a>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <div style={styles.headerRow}>
                    <h2 style={{ margin: 0, color: "#333" }}>WhatsApp Pairing</h2>
                    <button onClick={() => window.location.replace("/")} style={styles.buttonOutline}>Tutup</button>
                </div>

                <p style={styles.subtext}>Hubungkan aplikasi ini dengan WhatsApp bot.</p>

                {errorMsg && <div style={{ ...styles.alert, backgroundColor: "#ffebee", color: "#c62828" }}>{errorMsg}</div>}
                {successMsg && <div style={{ ...styles.alert, backgroundColor: "#e8f5e9", color: "#2e7d32" }}>{successMsg}</div>}

                <div style={styles.actionSection}>
                    <h4 style={{ marginTop: 0 }}>Metode 1: Scan QR Code</h4>
                    <button onClick={getQR} disabled={loading} style={styles.button}>
                        {loading && !qrCodeData && !pairingCode ? "Memuat..." : "Tampilkan QR Code"}
                    </button>
                    {qrCodeData && (
                        <div style={styles.qrContainer}>
                            <img
                                src={qrCodeData.qr_link}
                                alt="WhatsApp QR Code"
                                style={{ maxWidth: "100%", borderRadius: "8px" }}
                                onError={() => {
                                    setQrCodeData(null);
                                    setErrorMsg('QR Code tidak dapat dimuat. Silakan klik "Tampilkan QR Code" lagi.');
                                }}
                            />
                            <p style={{ fontSize: "12px", color: "#666" }}>Berlaku {qrCodeData.qr_duration} detik</p>
                        </div>
                    )}
                </div>

                <div style={{ textAlign: "center", margin: "15px 0", color: "#aaa", fontSize: "12px" }}>-- ATAU --</div>

                <div style={styles.actionSection}>
                    <h4 style={{ marginTop: 0 }}>Metode 2: Pairing Code (No HP)</h4>
                    <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Contoh: 628123456789 (Tanpa +)"
                        style={styles.input}
                    />
                    <button onClick={getCode} disabled={loading} style={styles.button}>
                        {loading && !qrCodeData && !pairingCode ? "Memuat..." : "Dapatkan Pairing Code"}
                    </button>
                    {pairingCode && (
                        <div style={styles.codeContainer}>
                            <h3 style={{ letterSpacing: "3px", margin: "10px 0" }}>{pairingCode}</h3>
                            <p style={{ fontSize: "12px", margin: 0 }}>Masukkan kode ini di HP Anda (Pilih "Tautkan dengan nomor telepon")</p>
                        </div>
                    )}
                </div>

                <div style={{ marginTop: "30px", borderTop: "1px solid #eee", paddingTop: "20px" }}>
                    <button onClick={handleLogoutWA} disabled={loading} style={{ ...styles.buttonOutline, color: "#d32f2f", borderColor: "#d32f2f", width: '100%' }}>
                        Logout Akun WhatsApp Aktif
                    </button>
                </div>
            </div>
        </div>
    );
}

const styles = {
    container: {
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: "50px",
        minHeight: "100vh",
        backgroundColor: "#f4f4f9",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    },
    card: {
        backgroundColor: "white",
        padding: "30px",
        borderRadius: "12px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        maxWidth: "500px",
        width: "100%",
    },
    headerRow: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "10px"
    },
    subtext: {
        fontSize: "14px",
        color: "#666",
        marginBottom: "20px"
    },
    input: {
        width: "100%",
        padding: "12px 15px",
        marginBottom: "15px",
        border: "1px solid #ddd",
        borderRadius: "6px",
        boxSizing: "border-box",
        fontSize: "14px"
    },
    button: {
        padding: "10px 15px",
        backgroundColor: "#2e7d32",
        color: "white",
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "14px",
        fontWeight: "500"
    },
    buttonOutline: {
        padding: "8px 12px",
        backgroundColor: "transparent",
        color: "#555",
        border: "1px solid #ccc",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "13px",
    },
    error: {
        color: "#d32f2f",
        fontSize: "13px",
        marginBottom: "15px",
        marginTop: "-5px"
    },
    alert: {
        padding: "10px",
        borderRadius: "6px",
        marginBottom: "20px",
        fontSize: "14px"
    },
    actionSection: {
        backgroundColor: "#fafafa",
        padding: "20px",
        borderRadius: "8px",
        border: "1px solid #eee"
    },
    qrContainer: {
        marginTop: "20px",
        textAlign: "center",
        padding: "10px",
        backgroundColor: "white",
        border: "1px solid #ddd",
        borderRadius: "8px"
    },
    codeContainer: {
        marginTop: "20px",
        textAlign: "center",
        padding: "15px",
        backgroundColor: "#e8f5e9",
        color: "#2e7d32",
        border: "1px dashed #2e7d32",
        borderRadius: "8px"
    }
};
