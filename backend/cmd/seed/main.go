package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"regexp"
	"strings"

	_ "github.com/lib/pq"

	"github.com/baniakhzab/backend/internal/config"
	"github.com/baniakhzab/backend/internal/db"
)

type rawPerson struct {
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

var profileIDRegex = regexp.MustCompile(`profile/(\d+)/`)

func extractProfileID(u string) (string, bool) {
	if u == "" {
		return "", false
	}
	m := profileIDRegex.FindStringSubmatch(u)
	if len(m) >= 2 {
		return m[1], true
	}
	return "", false
}

func main() {
	var filePath string
	flag.StringVar(&filePath, "file", "../with-gender.json", "Path to with-gender.json file")
	flag.Parse()

	loadEnvFile(".env")
	cfg := config.FromEnv()
	if cfg.DB.DSN == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is not set")
		os.Exit(1)
	}

	dbConn, err := sql.Open("postgres", cfg.DB.DSN)
	if err != nil {
		fmt.Fprintln(os.Stderr, "failed to open database:", err)
		os.Exit(1)
	}
	defer dbConn.Close()
	if err := dbConn.Ping(); err != nil {
		fmt.Fprintln(os.Stderr, "failed to ping database:", err)
		os.Exit(1)
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "failed to read file:", err)
		os.Exit(1)
	}

	var raws []rawPerson
	if err := json.Unmarshal(data, &raws); err != nil {
		fmt.Fprintln(os.Stderr, "failed to parse JSON:", err)
		os.Exit(1)
	}
	if len(raws) == 0 {
		fmt.Fprintln(os.Stderr, "no data found in JSON")
		return
	}

	store := db.NewStore(dbConn)
	ctx := context.Background()

	extToUUID := make(map[string]string)
	rawByExt := make(map[string]rawPerson)
	for _, rp := range raws {
		rawByExt[rp.ID] = rp
	}

	for _, rp := range raws {
		input := db.PersonInput{
			FullName:   strings.TrimSpace(rp.Name),
			Gender:     strings.TrimSpace(rp.Gender),
			WANumber:   "",
			Alamat:     "",
			URL:        strings.TrimSpace(rp.URL),
			FatherID:   nil,
			MotherID:   nil,
			SpouseIDs:  nil,
			Generation: "",
		}
		p, err := store.Persons.Insert(ctx, input)
		if err != nil {
			fmt.Fprintf(os.Stderr, "insert failed for external id %s (%s): %v\n", rp.ID, rp.Name, err)
			os.Exit(1)
		}
		extToUUID[rp.ID] = p.ID
	}

	for _, rp := range raws {
		uuid := extToUUID[rp.ID]
		if uuid == "" {
			fmt.Fprintf(os.Stderr, "missing uuid mapping for external id %s\n", rp.ID)
			os.Exit(1)
		}

		var fatherID *string
		if rp.FatherURL != nil {
			if ext, ok := extractProfileID(*rp.FatherURL); ok {
				if mapped, ok2 := extToUUID[ext]; ok2 {
					fatherID = &mapped
				}
			}
		}
		var motherID *string
		if rp.MotherURL != nil {
			if ext, ok := extractProfileID(*rp.MotherURL); ok {
				if mapped, ok2 := extToUUID[ext]; ok2 {
					motherID = &mapped
				}
			}
		}

		var spouseIDs []string
		for _, su := range rp.SpouseURLs {
			if ext, ok := extractProfileID(su); ok {
				if mapped, ok2 := extToUUID[ext]; ok2 {
					spouseIDs = append(spouseIDs, mapped)
				}
			}
		}

		input := db.PersonInput{
			FullName:   strings.TrimSpace(rp.Name),
			Gender:     strings.TrimSpace(rp.Gender),
			WANumber:   "",
			Alamat:     "",
			URL:        strings.TrimSpace(rp.URL),
			FatherID:   fatherID,
			MotherID:   motherID,
			SpouseIDs:  spouseIDs,
			Generation: "",
		}

		if _, err := store.Persons.Update(ctx, uuid, input); err != nil {
			fmt.Fprintf(os.Stderr, "update failed for external id %s (%s): %v\n", rp.ID, rp.Name, err)
			os.Exit(1)
		}
	}

	fmt.Printf("Seeding completed: %d persons inserted and linked.\n", len(raws))
}

func loadEnvFile(path string) {
	b, err := os.ReadFile(path)
	if err != nil {
		return
	}
	lines := strings.Split(string(b), "\n")
	for _, line := range lines {
		s := strings.TrimSpace(line)
		if s == "" {
			continue
		}
		if strings.HasPrefix(s, "#") {
			continue
		}
		idx := strings.Index(s, "=")
		if idx <= 0 {
			continue
		}
		key := strings.TrimSpace(s[:idx])
		val := strings.TrimSpace(s[idx+1:])
		_ = os.Setenv(key, val)
	}
}
