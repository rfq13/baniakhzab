const API_BASE = "/api/v1";

/**
 * Fetch parent couples from API
 */
export async function fetchParentCouples() {
  const res = await fetch(`${API_BASE}/parent-couples`, {
    credentials: "include",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Gagal memuat daftar pasangan orang tua.");
  }
  return res.json();
}

/**
 * Create a new person
 */
export async function createPerson(data) {
  const res = await fetch(`${API_BASE}/persons`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Gagal menambahkan anggota keluarga.");
  }
  return res.json();
}

/**
 * Upload photo (base64) - Returns URL
 * Note: For now, photos are stored as URLs.
 * This function can be extended to handle file uploads to a server.
 */
export async function uploadPhoto(file) {
  // Convert file to base64
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
