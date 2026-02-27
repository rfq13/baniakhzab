import { useState, useEffect, useRef } from "react";

export default function useWhatsAppMessages(password, isConnected) {
    const [messages, setMessages] = useState([]);
    const [error, setError] = useState("");
    const eventSourceRef = useRef(null);

    useEffect(() => {
        if (!password || !isConnected) return;

        const connectSSE = () => {
            // Include password in url or header for SSE? EventSource doesn't support custom headers easily natively, 
            // but we can use query param or use a polyfill if needed.
            // Since we need X-Setup-Password, let's use fetch API + ReadableStream instead of EventSource 
            // to send the custom header, or we can just proxy EventSource via fetch.
        };

        // Custom SSE using fetch to support custom headers
        let isMounted = true;
        const abortController = new AbortController();

        const fetchSSE = async () => {
            try {
                const response = await fetch("/api/v1/whatsapp/messages/stream", {
                    headers: {
                        "X-Setup-Password": password,
                        "Accept": "text/event-stream"
                    },
                    signal: abortController.signal
                });

                if (!response.ok) {
                    throw new Error("Failed to connect to message stream");
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const parts = buffer.split("\n\n");
                    buffer = parts.pop() || "";

                    for (const part of parts) {
                        if (part.startsWith("data: ")) {
                            const dataStr = part.replace("data: ", "").trim();
                            if (dataStr) {
                                try {
                                    const msg = JSON.parse(dataStr);
                                    if (isMounted) {
                                        setMessages(prev => [...prev, msg]);
                                    }
                                } catch (e) {
                                    console.error("Failed to parse SSE message", e);
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                if (err.name !== "AbortError" && isMounted) {
                    setError("Stream connection lost. Reconnecting...");
                    setTimeout(fetchSSE, 3000);
                }
            }
        };

        fetchSSE();

        return () => {
            isMounted = false;
            abortController.abort();
        };
    }, [password, isConnected]);

    const sendMessage = async (phone, text) => {
        try {
            const res = await fetch("/api/v1/whatsapp/messages/send", {
                method: "POST",
                headers: {
                    "X-Setup-Password": password,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ phone, message: text })
            });

            if (!res.ok) {
                throw new Error("Failed to send message: " + await res.text());
            }
        } catch (err) {
            setError(err.message);
            throw err;
        }
    };

    return { messages, sendMessage, error };
}
