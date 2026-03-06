import React, { useEffect, useState } from "react";

export default function Login() {
    const [status, setStatus] = useState("inisialisasi");
    const [errorMsg, setErrorMsg] = useState("");

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const token = params.get("token");

        if (token) {
            setStatus("memverifikasi token");
            fetch("/api/v1/auth/wa/consume", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ token }),
            })
                .then((res) => {
                    if (!res.ok) throw new Error("Token tidak valid atau sudah kadaluarsa.");
                    return res.json().catch(() => ({}));
                })
                .then(() => {
                    setStatus("berhasil");
                    // Hilangkan token dari URL dan reload halaman
                    window.location.replace("/");
                })
                .catch((err) => {
                    setErrorMsg(err.message);
                    setStatus("gagal");
                });
        } else {
            setStatus("menunggu_login");
        }
    }, []);

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <h2 style={{ marginTop: 0 }}>Login Silsilah Keluarga</h2>

                {status === "menunggu_login" && (
                    <div>
                        <p>Untuk masuk ke aplikasi, silakan kirim pesan WhatsApp dengan teks:</p>
                        <h3 style={styles.codeMessage}>AUTH</h3>
                        <p>Ke nomor bot WhatsApp sistem ini.</p>
                        <p style={styles.subtext}>
                            Sistem akan membalas dengan link unik untuk login ke aplikasi.
                        </p>
                        <div style={{ marginTop: "30px", fontSize: "12px", textAlign: "center" }}>
                            <a href="?setup=1" style={{ color: "#aaa", textDecoration: "none" }}>Pengaturan WhatsApp (Admin)</a>
                        </div>
                    </div>
                )}

                {(status === "inisialisasi" || status === "memverifikasi token") && (
                    <div style={styles.flexCenter}>
                        <div className="spinner" style={{ marginRight: "10px" }}></div>
                        <span>Memverifikasi proses login...</span>
                    </div>
                )}

                {status === "berhasil" && (
                    <div style={{ color: "green", fontWeight: "bold", textAlign: "center" }}>
                        Login berhasil! Mengalihkan...
                    </div>
                )}

                {status === "gagal" && (
                    <div style={{ color: "red", textAlign: "center" }}>
                        <strong>Gagal: </strong> {errorMsg}
                        <div style={{ marginTop: "20px" }}>
                            <button
                                onClick={() => window.location.replace("/")}
                                style={styles.button}
                            >
                                Kembali
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

const styles = {
    container: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        backgroundColor: "#f4f4f9",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    },
    card: {
        backgroundColor: "white",
        padding: "40px",
        borderRadius: "12px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
        maxWidth: "400px",
        width: "100%",
    },
    codeMessage: {
        backgroundColor: "#e8f5e9",
        color: "#2e7d32",
        padding: "15px",
        textAlign: "center",
        borderRadius: "8px",
        letterSpacing: "2px",
        fontSize: "24px",
        border: "1px dashed #2e7d32"
    },
    subtext: {
        fontSize: "14px",
        color: "#666",
        marginTop: "20px"
    },
    flexCenter: {
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px 0"
    },
    button: {
        padding: "10px 20px",
        backgroundColor: "#2e7d32",
        color: "white",
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "14px",
    }
};
