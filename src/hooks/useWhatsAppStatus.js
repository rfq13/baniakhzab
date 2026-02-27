import { useState, useEffect } from "react";

export default function useWhatsAppStatus(password) {
    const [status, setStatus] = useState({ is_connected: false, is_logged_in: false, device_id: "" });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!password) return;

        let isMounted = true;
        const fetchStatus = async () => {
            if (!isMounted) return;
            setLoading(true);
            try {
                const res = await fetch("/api/v1/whatsapp/setup/status", {
                    headers: { "X-Setup-Password": password }
                });
                if (!res.ok) {
                    if (res.status === 401) throw new Error("Invalid setup password");
                    throw new Error("Failed to get status");
                }
                const data = await res.json();
                if (isMounted) {
                    setStatus({
                        is_connected: Boolean(data.is_connected),
                        is_logged_in: Boolean(data.is_logged_in),
                        device_id: data.device_id || ""
                    });
                    setError("");
                }
            } catch (err) {
                if (isMounted) {
                    setError(err.message);
                    setStatus({ is_connected: false, is_logged_in: false, device_id: "" });
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 5000); // poll every 5s

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [password]);

    return { ...status, loading, error };
}
