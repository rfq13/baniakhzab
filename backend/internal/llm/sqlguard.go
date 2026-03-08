package llm

import (
	"fmt"
	"regexp"
	"strings"
)

// SQLGuardConfig holds the configuration for SQL query validation.
type SQLGuardConfig struct {
	AllowedTables []string
	DeniedColumns []string
	MaxRows       int
}

// DefaultSQLGuardConfig returns a strict default configuration for the genealogy DB.
func DefaultSQLGuardConfig() SQLGuardConfig {
	return SQLGuardConfig{
		AllowedTables: []string{"persons"},
		DeniedColumns: []string{},
		MaxRows:       50,
	}
}

// GuardResult holds the outcome of SQL validation.
type GuardResult struct {
	Allowed  bool
	Reason   string
	SafeSQL  string // the (possibly rewritten) SQL to execute
}

// denied SQL keywords that must never appear in a query from LLM.
var deniedKeywords = []string{
	"INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE",
	"TRUNCATE", "GRANT", "REVOKE", "COPY", "DO ", "CALL ",
	"SET ", "EXECUTE", "PREPARE",
}

// denied patterns: system catalogs, comment injection, sleep attacks.
var deniedPatterns = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\binformation_schema\b`),
	regexp.MustCompile(`(?i)\bpg_catalog\b`),
	regexp.MustCompile(`(?i)\bpg_sleep\b`),
	regexp.MustCompile(`(?i)\bpg_read_file\b`),
	regexp.MustCompile(`(?i)\bpg_ls_dir\b`),
	regexp.MustCompile(`(?i)\blo_import\b`),
	regexp.MustCompile(`(?i)\blo_export\b`),
	regexp.MustCompile(`(?i)\bdblink\b`),
	regexp.MustCompile(`/\*`),   // block comment open
	regexp.MustCompile(`\*/`),   // block comment close
	regexp.MustCompile(`(?i)--`), // line comment
}

// ValidateSQL checks an LLM-generated SQL string against security rules.
func ValidateSQL(sql string, cfg SQLGuardConfig) GuardResult {
	trimmed := strings.TrimSpace(sql)
	if trimmed == "" {
		return GuardResult{Allowed: false, Reason: "query kosong"}
	}

	// 1. Must start with SELECT (block WITH/CTE in phase 1 for safety)
	upper := strings.ToUpper(trimmed)
	if !strings.HasPrefix(upper, "SELECT") {
		return GuardResult{Allowed: false, Reason: "hanya query SELECT yang diizinkan"}
	}

	// 2. Block multi-statement: reject if semicolon appears before the end
	cleaned := stripStringLiterals(trimmed)
	if idx := strings.Index(cleaned, ";"); idx >= 0 && idx < len(cleaned)-1 {
		return GuardResult{Allowed: false, Reason: "multi-statement query tidak diizinkan"}
	}
	// Also reject if there's a semicolon followed by any non-whitespace
	if strings.Contains(cleaned, ";") {
		afterSemicolon := strings.TrimSpace(cleaned[strings.Index(cleaned, ";")+1:])
		if afterSemicolon != "" {
			return GuardResult{Allowed: false, Reason: "multi-statement query tidak diizinkan"}
		}
	}

	// 3. Check denied keywords (case-insensitive, word-boundary aware)
	for _, kw := range deniedKeywords {
		pattern := `(?i)\b` + regexp.QuoteMeta(strings.TrimSpace(kw)) + `\b`
		if matched, _ := regexp.MatchString(pattern, cleaned); matched {
			return GuardResult{Allowed: false, Reason: fmt.Sprintf("keyword '%s' tidak diizinkan", strings.TrimSpace(kw))}
		}
	}

	// 4. Check denied patterns (system catalogs, comments, sleep, etc.)
	for _, pat := range deniedPatterns {
		if pat.MatchString(cleaned) {
			return GuardResult{Allowed: false, Reason: fmt.Sprintf("pola '%s' tidak diizinkan", pat.String())}
		}
	}

	// 5. Table allowlist: extract referenced tables and verify each is allowed
	if len(cfg.AllowedTables) > 0 {
		tables := extractTableNames(cleaned)
		allowed := make(map[string]bool)
		for _, t := range cfg.AllowedTables {
			allowed[strings.ToLower(t)] = true
		}
		for _, t := range tables {
			if !allowed[strings.ToLower(t)] {
				return GuardResult{Allowed: false, Reason: fmt.Sprintf("tabel '%s' tidak diizinkan", t)}
			}
		}
	}

	// 6. Column denylist
	if len(cfg.DeniedColumns) > 0 {
		lowerSQL := strings.ToLower(cleaned)
		for _, col := range cfg.DeniedColumns {
			if strings.Contains(lowerSQL, strings.ToLower(col)) {
				return GuardResult{Allowed: false, Reason: fmt.Sprintf("kolom '%s' tidak diizinkan", col)}
			}
		}
	}

	// 7. Inject LIMIT if missing
	safeSQL := trimmed
	// Remove trailing semicolon for rewriting
	safeSQL = strings.TrimRight(safeSQL, "; \t\n\r")
	if cfg.MaxRows > 0 && !hasLimitClause(upper) {
		safeSQL = fmt.Sprintf("%s LIMIT %d", safeSQL, cfg.MaxRows)
	}

	return GuardResult{Allowed: true, SafeSQL: safeSQL}
}

// stripStringLiterals replaces string literals with placeholders to prevent
// false positives from keywords inside quoted strings.
func stripStringLiterals(sql string) string {
	// Replace 'any string content' with ''
	re := regexp.MustCompile(`'[^']*'`)
	return re.ReplaceAllString(sql, "''")
}

// extractTableNames does a best-effort extraction of table names from SQL.
// It looks for FROM/JOIN followed by an identifier.
func extractTableNames(sql string) []string {
	re := regexp.MustCompile(`(?i)\b(?:FROM|JOIN)\s+([a-zA-Z_][a-zA-Z0-9_]*)`)
	matches := re.FindAllStringSubmatch(sql, -1)
	seen := make(map[string]bool)
	var tables []string
	for _, m := range matches {
		name := strings.ToLower(m[1])
		// Skip SQL keywords that might follow FROM/JOIN in subqueries
		if name == "select" || name == "where" || name == "lateral" {
			continue
		}
		if !seen[name] {
			seen[name] = true
			tables = append(tables, m[1])
		}
	}
	return tables
}

// hasLimitClause checks whether the SQL already contains a LIMIT clause.
func hasLimitClause(upperSQL string) bool {
	// Match LIMIT that is not inside a subquery (simple heuristic)
	re := regexp.MustCompile(`\bLIMIT\s+\d+`)
	return re.MatchString(upperSQL)
}
