import React, { useEffect } from "react";
import EditPersonForm from "./EditPersonForm.jsx";

function EditPersonModal({ personId, isOpen = true, onClose, onSuccess }) {
    // Handle escape key
    useEffect(() => {
        function handleEscape(e) {
            if (e.key === "Escape" && isOpen) {
                onClose();
            }
        }
        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [isOpen, onClose]);

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    if (!isOpen || !personId) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-container" onClick={(e) => e.stopPropagation()}>
                <EditPersonForm
                    personId={personId}
                    onSuccess={onSuccess}
                    onCancel={onClose}
                />
            </div>
        </div>
    );
}

export default EditPersonModal;
