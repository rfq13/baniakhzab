import React, { useEffect } from "react";
import AddPersonForm from "./AddPersonForm.jsx";

function AddPersonModal({ isOpen, onClose, onSuccess }) {
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

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <AddPersonForm
          onSuccess={onSuccess}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}

export default AddPersonModal;
