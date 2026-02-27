import React, { useState, useEffect, useRef } from "react";
import useWhatsAppMessages from "../hooks/useWhatsAppMessages";

export default function WhatsAppChat({ password, isConnected }) {
    const { messages, sendMessage, error } = useWhatsAppMessages(password, isConnected);
    const [inputText, setInputText] = useState("");
    const [sending, setSending] = useState(false);
    const [targetPhone, setTargetPhone] = useState("");
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async (e) => {
        e.preventDefault();
        if (!inputText.trim() || !targetPhone.trim()) return;

        setSending(true);
        try {
            await sendMessage(targetPhone, inputText);
            setInputText("");
        } catch (err) {
            console.error(err);
        } finally {
            setSending(false);
        }
    };

    const groupedMessages = messages.reduce((acc, msg) => {
        const id = msg.chat_jid || msg.from_jid;
        if (!acc[id]) acc[id] = [];
        acc[id].push(msg);
        return acc;
    }, {});

    const activeChatId = targetPhone ? (targetPhone.includes("@") ? targetPhone : targetPhone + "@s.whatsapp.net") : "";

    return (
        <div style={styles.container}>
            <div style={styles.sidebar}>
                <h4 style={styles.sidebarTitle}>Live Chats</h4>
                {Object.keys(groupedMessages).length === 0 && (
                    <div style={styles.emptySidebar}>Kirim/terima pesan untuk memulai</div>
                )}
                <div style={styles.chatList}>
                    {Object.keys(groupedMessages).map(jid => {
                        const msgs = groupedMessages[jid];
                        const lastMsg = msgs[msgs.length - 1];
                        const name = lastMsg.person_id ? lastMsg.person_name : (lastMsg.from_name || jid.split("@")[0]);
                        return (
                            <div
                                key={jid}
                                style={{
                                    ...styles.chatListItem,
                                    backgroundColor: activeChatId === jid ? "#e8f5e9" : "transparent"
                                }}
                                onClick={() => setTargetPhone(jid.split("@")[0])}
                            >
                                <div style={styles.avatar}>{name.charAt(0).toUpperCase()}</div>
                                <div style={styles.chatInfo}>
                                    <div style={styles.chatName}>{name}</div>
                                    <div style={styles.chatPreview}>{lastMsg.body.substring(0, 20)}...</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div style={styles.chatArea}>
                <div style={styles.chatHeader}>
                    {targetPhone ? (
                        <>
                            <strong>{targetPhone}</strong>
                            <span style={{ fontSize: "12px", color: "#666", marginLeft: "10px" }}>
                                (Pastikan nomor benar)
                            </span>
                        </>
                    ) : (
                        <span style={{ color: "#888" }}>Pilih atau masukkan nomor tujuan</span>
                    )}
                </div>

                <div style={styles.messagesContainer}>
                    {error && <div style={styles.errorBanner}>{error}</div>}
                    {!targetPhone && <div style={styles.emptyState}>Mulai Obrolan WhatsApp</div>}

                    {targetPhone && (!groupedMessages[activeChatId] || groupedMessages[activeChatId].length === 0) && (
                        <div style={styles.emptyState}>Belum ada pPesan. Ketik di bawah untuk memulai.</div>
                    )}

                    {targetPhone && groupedMessages[activeChatId]?.map((msg, i) => {
                        const isMe = msg.is_from_me;
                        return (
                            <div key={msg.id || i} style={{
                                ...styles.messageWrapper,
                                justifyContent: isMe ? "flex-end" : "flex-start"
                            }}>
                                <div style={{
                                    ...styles.messageBubble,
                                    backgroundColor: isMe ? "#e8f5e9" : "#fff",
                                    border: isMe ? "1px solid #c8e6c9" : "1px solid #e0e0e0"
                                }}>
                                    {!isMe && msg.person_name && (
                                        <div style={styles.messageName}>{msg.person_name}</div>
                                    )}
                                    <div style={styles.messageBody}>{msg.body}</div>
                                    <div style={styles.messageTime}>
                                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSend} style={styles.inputArea}>
                    <input
                        type="text"
                        placeholder="628123456789 (No. Tujuan)"
                        value={targetPhone}
                        onChange={(e) => setTargetPhone(e.target.value)}
                        style={styles.phoneInput}
                    />
                    <input
                        type="text"
                        placeholder="Ketik pesan..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        style={styles.textInput}
                    />
                    <button type="submit" disabled={sending || !inputText.trim() || !targetPhone.trim()} style={styles.sendBtn}>
                        {sending ? "..." : "Kirim"}
                    </button>
                </form>
            </div>
        </div>
    );
}

const styles = {
    container: {
        display: "flex",
        height: "500px",
        border: "1px solid #ddd",
        borderRadius: "8px",
        overflow: "hidden",
        backgroundColor: "#f9f9f9"
    },
    sidebar: {
        width: "250px",
        borderRight: "1px solid #ddd",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#fff"
    },
    sidebarTitle: {
        padding: "15px",
        margin: 0,
        borderBottom: "1px solid #eee",
        fontSize: "14px",
        color: "#333",
        backgroundColor: "#f5f5f5"
    },
    chatList: {
        flex: 1,
        overflowY: "auto",
    },
    chatListItem: {
        display: "flex",
        alignItems: "center",
        padding: "15px",
        borderBottom: "1px solid #f0f0f0",
        cursor: "pointer",
        transition: "background 0.2s"
    },
    avatar: {
        width: "35px",
        height: "35px",
        borderRadius: "50%",
        backgroundColor: "#4caf50",
        color: "white",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontSize: "16px",
        fontWeight: "bold",
        marginRight: "10px"
    },
    chatInfo: {
        flex: 1,
        overflow: "hidden"
    },
    chatName: {
        fontWeight: "600",
        fontSize: "13px",
        color: "#333",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
    },
    chatPreview: {
        fontSize: "11px",
        color: "#888",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis"
    },
    emptySidebar: {
        padding: "20px",
        textAlign: "center",
        fontSize: "12px",
        color: "#aaa"
    },
    chatArea: {
        flex: 1,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#efeae2" // WhatsApp-like background
    },
    chatHeader: {
        padding: "15px",
        backgroundColor: "#fff",
        borderBottom: "1px solid #ddd",
        fontSize: "14px",
        color: "#333",
        display: "flex",
        alignItems: "center"
    },
    messagesContainer: {
        flex: 1,
        padding: "20px",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column"
    },
    messageWrapper: {
        display: "flex",
        marginBottom: "10px",
        width: "100%"
    },
    messageBubble: {
        maxWidth: "70%",
        padding: "8px 12px",
        borderRadius: "10px",
        boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
        position: "relative"
    },
    messageName: {
        fontSize: "10px",
        color: "#2e7d32",
        fontWeight: "bold",
        marginBottom: "4px"
    },
    messageBody: {
        fontSize: "13px",
        color: "#333",
        wordBreak: "break-word",
        lineHeight: "1.4"
    },
    messageTime: {
        fontSize: "10px",
        color: "#888",
        textAlign: "right",
        marginTop: "4px"
    },
    emptyState: {
        textAlign: "center",
        color: "#888",
        margin: "auto",
        backgroundColor: "rgba(255,255,255,0.6)",
        padding: "5px 15px",
        borderRadius: "20px",
        fontSize: "12px"
    },
    errorBanner: {
        backgroundColor: "#ffebee",
        color: "#c62828",
        padding: "10px",
        textAlign: "center",
        fontSize: "12px",
        borderRadius: "4px",
        marginBottom: "10px"
    },
    inputArea: {
        display: "flex",
        padding: "10px",
        backgroundColor: "#fff",
        borderTop: "1px solid #ddd"
    },
    phoneInput: {
        width: "120px",
        padding: "10px",
        border: "1px solid #ccc",
        borderRadius: "20px",
        marginRight: "10px",
        fontSize: "13px"
    },
    textInput: {
        flex: 1,
        padding: "10px 15px",
        border: "1px solid #ccc",
        borderRadius: "20px",
        marginRight: "10px",
        fontSize: "13px"
    },
    sendBtn: {
        padding: "0 20px",
        backgroundColor: "#2e7d32",
        color: "white",
        border: "none",
        borderRadius: "20px",
        cursor: "pointer",
        fontWeight: "bold"
    }
};
