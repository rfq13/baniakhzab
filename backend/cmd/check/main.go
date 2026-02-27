package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sort"
	"strings"

	_ "github.com/lib/pq"
)

type jsonPerson struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	URL        string   `json:"url"`
	FatherURL  *string  `json:"father_url"`
	MotherURL  *string  `json:"mother_url"`
	SpouseURLs []string `json:"spouse_urls"`
	IsMantu    bool     `json:"is_mantu"`
	ImgURL     string   `json:"img_url"`
	Gender     string   `json:"gender"`
}

type dbRow struct {
	ChildName   string
	FatherName  string
	MotherName  string
	SpouseNames []string
}

func loadEnv(path string) {
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	lines := strings.Split(string(b), "\n")
	for _, line := range lines {
		s := strings.TrimSpace(line)
		if s == "" || strings.HasPrefix(s, "#") {
			continue
		}
		kv := strings.SplitN(s, "=", 2)
		if len(kv) != 2 {
			continue
		}
		_ = os.Setenv(strings.TrimSpace(kv[0]), strings.TrimSpace(kv[1]))
	}
}

func norm(s string) string {
	return strings.TrimSpace(strings.ToLower(s))
}

func uniqueSorted(list []string) []string {
	if len(list) == 0 {
		return list
	}
	m := make(map[string]struct{}, len(list))
	for _, v := range list {
		v = norm(v)
		if v == "" {
			continue
		}
		m[v] = struct{}{}
	}
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func main() {
	var filePath string
	flag.StringVar(&filePath, "file", "../with-gender.json", "Path to with-gender.json")
	flag.Parse()

	loadEnv("../backend/.env")
	if os.Getenv("DATABASE_URL") == "" {
		loadEnv(".env")
	}
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is not set")
		os.Exit(1)
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		fmt.Fprintln(os.Stderr, "failed to open database:", err)
		os.Exit(1)
	}
	defer db.Close()

	// Read JSON
	raw, err := os.ReadFile(filePath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "failed to read JSON:", err)
		os.Exit(1)
	}
	var jpeople []jsonPerson
	if err := json.Unmarshal(raw, &jpeople); err != nil {
		fmt.Fprintln(os.Stderr, "failed to parse JSON:", err)
		os.Exit(1)
	}
	if len(jpeople) == 0 {
		fmt.Println("JSON is empty; nothing to compare.")
		return
	}

	// Build expected mapping by names only (no UUID)
	type expectedRow struct {
		ChildName   string
		FatherName  string
		MotherName  string
		SpouseNames []string
		IsMantu     bool
		Gender      string
	}
	expMap := make(map[string]expectedRow, len(jpeople))
	// Build helper id->name map
	idToName := make(map[string]string, len(jpeople))
	for _, p := range jpeople {
		idToName[p.ID] = p.Name
	}
	extractID := func(url string) string {
		// profile/<num>/
		url = strings.TrimSpace(url)
		i := strings.Index(url, "profile/")
		if i < 0 {
			return ""
		}
		url = url[i+len("profile/"):]
		j := strings.Index(url, "/")
		if j > 0 {
			return url[:j]
		}
		return ""
	}
	for _, p := range jpeople {
		var fatherName, motherName string
		if p.FatherURL != nil {
			if fid := extractID(*p.FatherURL); fid != "" {
				if n := idToName[fid]; n != "" {
					fatherName = n
				}
			}
		}
		if p.MotherURL != nil {
			if mid := extractID(*p.MotherURL); mid != "" {
				if n := idToName[mid]; n != "" {
					motherName = n
				}
			}
		}
		spNames := make([]string, 0, len(p.SpouseURLs))
		for _, su := range p.SpouseURLs {
			if sid := extractID(su); sid != "" {
				if n := idToName[sid]; n != "" {
					spNames = append(spNames, n)
				}
			}
		}
		expMap[norm(p.Name)] = expectedRow{
			ChildName:   p.Name,
			FatherName:  fatherName,
			MotherName:  motherName,
			SpouseNames: uniqueSorted(spNames),
			IsMantu:     p.IsMantu,
			Gender:      strings.TrimSpace(p.Gender),
		}
	}

	// Query DB using names only; no UUID in output
	const q = `
		WITH data AS (
		  SELECT
		    c.full_name AS child_name,
		    f.full_name AS father_name,
		    m.full_name AS mother_name,
		    (
		      SELECT string_agg(s.full_name, '||')
		      FROM persons s
		      WHERE s.id = ANY (c.spouse_ids)
		    ) AS spouse_names_str,
		    c.gender AS gender,
		    (c.father_id IS NULL AND c.mother_id IS NULL AND array_length(c.spouse_ids,1) IS NOT NULL) AS is_mantu
		  FROM persons c
		  LEFT JOIN persons f ON c.father_id = f.id
		  LEFT JOIN persons m ON c.mother_id = m.id
		  WHERE c.deleted_at IS NULL
		)
		SELECT child_name, COALESCE(father_name,''), COALESCE(mother_name,''), COALESCE(spouse_names_str,''), COALESCE(gender,''), is_mantu
		FROM data
	`
	rows, err := db.QueryContext(context.Background(), q)
	if err != nil {
		fmt.Fprintln(os.Stderr, "failed to query database:", err)
		os.Exit(1)
	}
	defer rows.Close()

	var mismatches int
	var checked int
	type mismatch struct {
		Child string
		Issues []string
	}
	var report []mismatch

	for rows.Next() {
		var child, father, mother, spouseStr, gender string
		var isMantu bool
		if err := rows.Scan(&child, &father, &mother, &spouseStr, &gender, &isMantu); err != nil {
			fmt.Fprintln(os.Stderr, "scan error:", err)
			os.Exit(1)
		}
		checked++
		exp, ok := expMap[norm(child)]
		issues := []string{}
		if !ok {
			issues = append(issues, "missing_in_json")
		} else {
			expSp := exp.SpouseNames
			var dbSp []string
			if strings.TrimSpace(spouseStr) != "" {
				dbSp = strings.Split(spouseStr, "||")
				for i := range dbSp {
					dbSp[i] = norm(dbSp[i])
				}
			} else {
				dbSp = []string{}
			}
			dbSp = uniqueSorted(dbSp)
			if norm(exp.FatherName) != norm(father) {
				issues = append(issues, fmt.Sprintf("father_mismatch: json='%s' db='%s'", exp.FatherName, father))
			}
			if norm(exp.MotherName) != norm(mother) {
				issues = append(issues, fmt.Sprintf("mother_mismatch: json='%s' db='%s'", exp.MotherName, mother))
			}
			if strings.TrimSpace(exp.Gender) != strings.TrimSpace(gender) && strings.TrimSpace(exp.Gender) != "" {
				issues = append(issues, fmt.Sprintf("gender_mismatch: json='%s' db='%s'", exp.Gender, gender))
			}
			if !equalStringSets(expSp, dbSp) {
				issues = append(issues, fmt.Sprintf("spouse_mismatch: json=%v db=%v", expSp, dbSp))
			}
			if exp.IsMantu != isMantu {
				issues = append(issues, fmt.Sprintf("is_mantu_mismatch: json=%v db=%v", exp.IsMantu, isMantu))
			}
		}
		if len(issues) > 0 {
			mismatches++
			report = append(report, mismatch{Child: child, Issues: issues})
		}
	}
	if err := rows.Err(); err != nil {
		fmt.Fprintln(os.Stderr, "rows error:", err)
		os.Exit(1)
	}

	fmt.Printf("Checked %d DB persons against JSON (%d mismatches)\n", checked, mismatches)
	for _, mm := range report {
		fmt.Printf("- %s:\n", mm.Child)
		for _, iss := range mm.Issues {
			fmt.Printf("    • %s\n", iss)
		}
	}
}

// pqArrayStrings converts []sql.NullString scanning into a driver-friendly receiver
type pqArrayStrings []sql.NullString

func (a *pqArrayStrings) Scan(src any) error {
	switch v := src.(type) {
	case []byte:
		// Parse Postgres text array: {"a","b"}
		s := strings.TrimSpace(string(v))
		s = strings.TrimPrefix(s, "{")
		s = strings.TrimSuffix(s, "}")
		if s == "" {
			*a = nil
			return nil
		}
		parts := splitCSV(s)
		out := make([]sql.NullString, 0, len(parts))
		for _, p := range parts {
			p = strings.Trim(p, `"`)
			out = append(out, sql.NullString{String: p, Valid: p != ""})
		}
		*a = out
		return nil
	default:
		return fmt.Errorf("unsupported array scan type %T", src)
	}
}

func splitCSV(s string) []string {
	var parts []string
	var cur strings.Builder
	inQuote := false
	for i := 0; i < len(s); i++ {
		ch := s[i]
		if ch == '"' {
			inQuote = !inQuote
			continue
		}
		if ch == ',' && !inQuote {
			parts = append(parts, cur.String())
			cur.Reset()
			continue
		}
		cur.WriteByte(ch)
	}
	parts = append(parts, cur.String())
	return parts
}

func equalStringSets(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
