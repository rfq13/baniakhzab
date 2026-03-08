import { useCallback, useEffect, useState } from 'react';

export default function useOrgData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [authRedirect, setAuthRedirect] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => {
    setRefreshTick((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      setAuthRedirect(false);
      try {
        const isLocalHost =
          typeof window !== 'undefined' &&
          (window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1');

        const fetchTree = async () =>
          fetch('/api/v1/tree', {
            credentials: 'include',
          });

        let res = await fetchTree();
        if (res.status === 401 && isLocalHost) {
          const devRes = await fetch('/api/v1/auth/dev', {
            method: 'POST',
            credentials: 'include',
          });
          if (devRes.ok) {
            res = await fetchTree();
          }
        }

        if (!res.ok) {
          if (res.status === 401) {
            setAuthRedirect(true);
          }
          const text = await res.text();
          throw new Error(text || 'Gagal memuat data dari backend.');
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
            name: p.name || p.full_name || 'Tanpa Nama',
            gender: p.gender || '',
            is_mantu: Boolean(p.is_mantu),
            generation: p.generation || null,
            img_url: p.img_url || '',
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
          setError(e instanceof Error ? e.message : 'Gagal memuat data.');
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [refreshTick]);

  return { data, loading, error, authRedirect, refresh };
}
