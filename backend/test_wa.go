package main

import (
	"bufio"
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/baniakhzab/backend/internal/db"
	_ "github.com/lib/pq"
)

func main() {
	f, err := os.Open(".env")
	if err == nil {
		scanner := bufio.NewScanner(f)
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			parts := strings.SplitN(line, "=", 2)
			if len(parts) == 2 {
				os.Setenv(strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]))
			}
		}
		f.Close()
	}

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	database, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer database.Close()

	store := db.NewStore(database)

	num := "6281232072122"
	fmt.Println("Looking up WA number:", num)

	ctx := context.Background()
	p, err := store.Persons.GetByWANumber(ctx, num)
	if err != nil {
		fmt.Printf("ERROR looking up %s: %v\n", num, err)
		return
	}
	fmt.Printf("Success! ID: %s, Name: %s\n", p.ID, p.FullName)

	// Check FatherID and MotherID
	if p.FatherID != nil {
		fmt.Printf("FatherID: %s\n", *p.FatherID)
		father, err := store.Persons.GetByID(ctx, *p.FatherID)
		if err != nil {
			fmt.Printf("  ERROR fetching father: %v\n", err)
		} else {
			fmt.Printf("  Father Name: %s\n", father.FullName)
		}
	} else {
		fmt.Println("FatherID: nil (NOT SET)")
	}

	if p.MotherID != nil {
		fmt.Printf("MotherID: %s\n", *p.MotherID)
		mother, err := store.Persons.GetByID(ctx, *p.MotherID)
		if err != nil {
			fmt.Printf("  ERROR fetching mother: %v\n", err)
		} else {
			fmt.Printf("  Mother Name: %s\n", mother.FullName)
		}
	} else {
		fmt.Println("MotherID: nil (NOT SET)")
	}
}
