package llm

import (
	"testing"
)

func TestValidateSQL_AllowsSimpleSelect(t *testing.T) {
	cfg := DefaultSQLGuardConfig()
	cases := []struct {
		name string
		sql  string
	}{
		{"basic select", "SELECT id, full_name FROM persons"},
		{"with where", "SELECT id FROM persons WHERE gender = 'L'"},
		{"with limit", "SELECT id FROM persons LIMIT 10"},
		{"with join self", "SELECT p1.id FROM persons p1 JOIN persons p2 ON p1.father_id = p2.id"},
		{"trailing semicolon", "SELECT id FROM persons;"},
		{"lowercase", "select id from persons"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := ValidateSQL(tc.sql, cfg)
			if !r.Allowed {
				t.Errorf("expected allowed, got blocked: %s (sql: %s)", r.Reason, tc.sql)
			}
		})
	}
}

func TestValidateSQL_InjectsLimit(t *testing.T) {
	cfg := DefaultSQLGuardConfig()
	cfg.MaxRows = 50

	r := ValidateSQL("SELECT id FROM persons", cfg)
	if !r.Allowed {
		t.Fatalf("expected allowed, got blocked: %s", r.Reason)
	}
	if r.SafeSQL != "SELECT id FROM persons LIMIT 50" {
		t.Errorf("expected injected LIMIT 50, got: %s", r.SafeSQL)
	}
}

func TestValidateSQL_PreservesExistingLimit(t *testing.T) {
	cfg := DefaultSQLGuardConfig()
	cfg.MaxRows = 50

	r := ValidateSQL("SELECT id FROM persons LIMIT 10", cfg)
	if !r.Allowed {
		t.Fatalf("expected allowed, got blocked: %s", r.Reason)
	}
	if r.SafeSQL != "SELECT id FROM persons LIMIT 10" {
		t.Errorf("expected preserved LIMIT 10, got: %s", r.SafeSQL)
	}
}

func TestValidateSQL_BlocksNonSelect(t *testing.T) {
	cfg := DefaultSQLGuardConfig()
	cases := []struct {
		name string
		sql  string
	}{
		{"insert", "INSERT INTO persons (full_name) VALUES ('test')"},
		{"update", "UPDATE persons SET full_name = 'x' WHERE id = 1"},
		{"delete", "DELETE FROM persons WHERE id = 1"},
		{"drop", "DROP TABLE persons"},
		{"alter", "ALTER TABLE persons ADD COLUMN x TEXT"},
		{"create", "CREATE TABLE evil (id int)"},
		{"truncate", "TRUNCATE persons"},
		{"with cte", "WITH x AS (SELECT 1) SELECT * FROM x"},
		{"empty", ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := ValidateSQL(tc.sql, cfg)
			if r.Allowed {
				t.Errorf("expected blocked, got allowed for sql: %s", tc.sql)
			}
		})
	}
}

func TestValidateSQL_BlocksMultiStatement(t *testing.T) {
	cfg := DefaultSQLGuardConfig()
	cases := []string{
		"SELECT 1; DROP TABLE persons",
		"SELECT 1; DELETE FROM persons WHERE 1=1",
		"SELECT id FROM persons; SELECT pg_sleep(10)",
	}
	for _, sql := range cases {
		t.Run(sql, func(t *testing.T) {
			r := ValidateSQL(sql, cfg)
			if r.Allowed {
				t.Errorf("expected blocked multi-statement, got allowed: %s", sql)
			}
		})
	}
}

func TestValidateSQL_BlocksSystemCatalogs(t *testing.T) {
	cfg := DefaultSQLGuardConfig()
	cases := []string{
		"SELECT * FROM information_schema.tables",
		"SELECT * FROM pg_catalog.pg_tables",
		"SELECT pg_sleep(10)",
		"SELECT pg_read_file('/etc/passwd')",
	}
	for _, sql := range cases {
		t.Run(sql, func(t *testing.T) {
			r := ValidateSQL(sql, cfg)
			if r.Allowed {
				t.Errorf("expected blocked, got allowed: %s", sql)
			}
		})
	}
}

func TestValidateSQL_BlocksComments(t *testing.T) {
	cfg := DefaultSQLGuardConfig()
	cases := []string{
		"SELECT id FROM persons -- drop table",
		"SELECT id FROM persons /* evil */",
	}
	for _, sql := range cases {
		t.Run(sql, func(t *testing.T) {
			r := ValidateSQL(sql, cfg)
			if r.Allowed {
				t.Errorf("expected blocked comment, got allowed: %s", sql)
			}
		})
	}
}

func TestValidateSQL_BlocksDisallowedTable(t *testing.T) {
	cfg := DefaultSQLGuardConfig() // only "persons" allowed
	cases := []string{
		"SELECT * FROM wa_tokens",
		"SELECT * FROM chat_messages",
		"SELECT * FROM app_settings",
		"SELECT p.id FROM persons p JOIN wa_tokens t ON p.id = t.person_id",
	}
	for _, sql := range cases {
		t.Run(sql, func(t *testing.T) {
			r := ValidateSQL(sql, cfg)
			if r.Allowed {
				t.Errorf("expected blocked table, got allowed: %s", sql)
			}
		})
	}
}

func TestValidateSQL_BlocksDeniedColumns(t *testing.T) {
	cfg := DefaultSQLGuardConfig()
	cfg.DeniedColumns = []string{"wa_number"}

	r := ValidateSQL("SELECT id, wa_number FROM persons", cfg)
	if r.Allowed {
		t.Errorf("expected blocked column wa_number, got allowed")
	}
}

func TestValidateSQL_StringLiteralBypass(t *testing.T) {
	cfg := DefaultSQLGuardConfig()
	// A keyword inside a string literal should NOT trigger a false positive
	r := ValidateSQL("SELECT id FROM persons WHERE full_name = 'DELETE ME'", cfg)
	if !r.Allowed {
		t.Errorf("keyword inside string literal should not block: %s", r.Reason)
	}
}

func TestValidateSQL_PromptInjectionAttempts(t *testing.T) {
	cfg := DefaultSQLGuardConfig()
	cases := []struct {
		name string
		sql  string
	}{
		{"ignore instructions delete", "SELECT 1; DELETE FROM persons WHERE 1=1"},
		{"sleep injection", "SELECT pg_sleep(999)"},
		{"union system catalog", "SELECT id FROM persons UNION SELECT tablename FROM pg_catalog.pg_tables"},
		{"stacked query", "SELECT 1;\nDROP TABLE persons"},
		{"comment bypass", "SELECT id FROM persons -- ; DROP TABLE persons"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := ValidateSQL(tc.sql, cfg)
			if r.Allowed {
				t.Errorf("prompt injection should be blocked: %s", tc.sql)
			}
		})
	}
}
