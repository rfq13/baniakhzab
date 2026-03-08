const API_BASE = '/api/v1';

/**
 * Fetch all persons (with optional search query)
 */
export async function fetchPersons(search = '') {
  const url = new URL(`${window.location.origin}${API_BASE}/persons`);
  if (search) {
    url.searchParams.set('q', search);
  }
  url.searchParams.set('limit', '1000'); // Increase limit for searching

  const res = await fetch(url.toString(), {
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Gagal memuat daftar anggota.');
  }
  return res.json();
}

/**
 * Fetch parent couples from API
 */
export async function fetchParentCouples() {
  const res = await fetch(`${API_BASE}/parent-couples`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Gagal memuat daftar pasangan orang tua.');
  }
  return res.json();
}

/**
 * Create a new person
 */
export async function createPerson(data) {
  const res = await fetch(`${API_BASE}/persons`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Gagal menambahkan anggota keluarga.');
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

/**
 * Upload person photo to server, returns the image URL path
 */
export async function uploadPersonPhoto(file) {
  const formData = new FormData();
  formData.append('photo', file);
  const res = await fetch(`${API_BASE}/upload/photo`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Gagal mengupload foto.');
  }
  const data = await res.json();
  return data.url;
}

/**
 * Update an existing person
 */
export async function updatePerson(id, data) {
  const res = await fetch(`${API_BASE}/persons/${id}`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Gagal menyimpan perubahan anggota keluarga.');
  }
  return res.json();
}

/**
 * Get person by id
 */
export async function getPerson(id) {
  const res = await fetch(`${API_BASE}/persons/${id}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Gagal memuat data anggota keluarga.');
  }
  return res.json();
}
