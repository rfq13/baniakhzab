import { useEffect, useState } from "react";

export default function useOrgData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authRedirect, setAuthRedirect] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        let token =
          localStorage.getItem("authToken") ||
          localStorage.getItem("access_token") ||
          "";
        if (!token && typeof window !== "undefined") {
          const host = window.location.hostname;
          if (host === "localhost" || host === "127.0.0.1") {
            const devRes = await fetch("/api/v1/auth/dev", { method: "POST" });
            if (devRes.ok) {
              const devJson = await devRes.json();
              const t =
                devJson && devJson.access_token ? devJson.access_token : "";
              if (t) {
                localStorage.setItem("access_token", t);
                token = t;
              }
            }
          }
        }

        if (!token) {
          setAuthRedirect(true);
          setLoading(false);
          return;
        }

        const headers = {};
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
        const res = await fetch("/api/v1/tree", { headers });
        if (!res.ok) {
          if (res.status === 401) {
            setAuthRedirect(true);
            localStorage.removeItem("access_token");
            localStorage.removeItem("authToken");
          }
          const text = await res.text();
          throw new Error(text || "Gagal memuat data dari backend.");
        }
        const json = await res.json();
        const persons = Array.isArray(json)
          ? json
          : Array.isArray(json.persons)
            ? json.persons
            : [];
        const mapped = persons.map((p) => {
          const id = String(p.id);
          const fatherId = p.father_id || null;
          const motherId = p.mother_id || null;
          const spouseIds = Array.isArray(p.spouse_ids)
            ? p.spouse_ids.map(String)
            : [];
          return {
            id,
            name: p.name || p.full_name || "Tanpa Nama",
            gender: p.gender || "",
            is_mantu: Boolean(p.is_mantu),
            generation: p.generation || null,
            img_url: "",
            father_id: fatherId,
            mother_id: motherId,
            spouse_ids: spouseIds,
            father_url: fatherId ? `/profile/${fatherId}/` : null,
            mother_url: motherId ? `/profile/${motherId}/` : null,
            spouse_urls: spouseIds.map((sid) => `/profile/${sid}/`),
          };
        });
        if (!cancelled) {
          setData(mapped);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Gagal memuat data.");
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading, error, authRedirect };
}
