package db

import (
	"context"
	"database/sql"
	"time"

	"github.com/lib/pq"
)

type Store struct {
	DB       *sql.DB
	Persons  PersonStore
	Tokens   WATokenStore
	Settings SettingsStore
	Chat     ChatStore
}

func NewStore(db *sql.DB) *Store {
	return &Store{
		DB:       db,
		Persons:  PersonStore{DB: db},
		Tokens:   WATokenStore{DB: db},
		Settings: SettingsStore{DB: db},
		Chat:     ChatStore{DB: db},
	}
}

// SettingsStore provides a simple key-value store backed by the app_settings table.
type SettingsStore struct {
	DB *sql.DB
}

// EnsureTable creates the app_settings table if it doesn't exist.
func (s SettingsStore) EnsureTable(ctx context.Context) error {
	const q = `
		CREATE TABLE IF NOT EXISTS app_settings (
			key   TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`
	_, err := s.DB.ExecContext(ctx, q)
	return err
}

// Get retrieves a setting value by key. Returns empty string if not found.
func (s SettingsStore) Get(ctx context.Context, key string) (string, error) {
	const q = `SELECT value FROM app_settings WHERE key = $1`
	var val string
	err := s.DB.QueryRowContext(ctx, q, key).Scan(&val)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return val, err
}

// Set upserts a setting value by key.
func (s SettingsStore) Set(ctx context.Context, key, value string) error {
	const q = `
		INSERT INTO app_settings (key, value, updated_at)
		VALUES ($1, $2, now())
		ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()
	`
	_, err := s.DB.ExecContext(ctx, q, key, value)
	return err
}

type Person struct {
	ID         string     `json:"id"`
	FullName   string     `json:"full_name"`
	Gender     string     `json:"gender,omitempty"`
	WANumber   string     `json:"wa_number,omitempty"`
	Alamat     string     `json:"alamat,omitempty"`
	URL        string     `json:"url,omitempty"`
	ImgURL     string     `json:"img_url,omitempty"`
	FatherID   *string    `json:"father_id,omitempty"`
	MotherID   *string    `json:"mother_id,omitempty"`
	SpouseIDs  []string   `json:"spouse_ids"`
	Generation string     `json:"generation,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
	DeletedAt  *time.Time `json:"-"`
}

type PersonInput struct {
	FullName   string   `json:"full_name"`
	Gender     string   `json:"gender,omitempty"`
	WANumber   string   `json:"wa_number,omitempty"`
	Alamat     string   `json:"alamat,omitempty"`
	URL        string   `json:"url,omitempty"`
	ImgURL     string   `json:"img_url,omitempty"`
	FatherID   *string  `json:"father_id,omitempty"`
	MotherID   *string  `json:"mother_id,omitempty"`
	SpouseIDs  []string `json:"spouse_ids"`
	Generation string   `json:"generation,omitempty"`
}

type PersonStore struct {
	DB *sql.DB
}

func (s PersonStore) Insert(ctx context.Context, input PersonInput) (*Person, error) {
	const q = `
		INSERT INTO persons (full_name, gender, wa_number, alamat, url, img_url, father_id, mother_id, spouse_ids, generation)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::int[], '{}'::int[]), $10)
		RETURNING id, full_name, gender, wa_number, alamat, url, img_url, father_id, mother_id, spouse_ids, generation, created_at, updated_at, deleted_at
	`

	row := s.DB.QueryRowContext(
		ctx,
		q,
		input.FullName,
		nullIfEmpty(input.Gender),
		nullIfEmpty(input.WANumber),
		nullIfEmpty(input.Alamat),
		nullIfEmpty(input.URL),
		nullIfEmpty(input.ImgURL),
		input.FatherID,
		input.MotherID,
		pgUUIDArray(input.SpouseIDs),
		nullIfEmpty(input.Generation),
	)

	var p Person
	if err := scanPerson(row, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (s PersonStore) GetByID(ctx context.Context, id string) (*Person, error) {
	const q = `
		SELECT id, full_name, gender, wa_number, alamat, url, img_url, father_id, mother_id, spouse_ids, generation, created_at, updated_at, deleted_at
		FROM persons
		WHERE id = $1 AND deleted_at IS NULL
	`

	row := s.DB.QueryRowContext(ctx, q, id)
	var p Person
	if err := scanPerson(row, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (s PersonStore) GetByWANumber(ctx context.Context, waNumber string) (*Person, error) {
	const q = `
		SELECT id, full_name, gender, wa_number, alamat, url, img_url, father_id, mother_id, spouse_ids, generation, created_at, updated_at, deleted_at
		FROM persons
		WHERE wa_number = $1 AND deleted_at IS NULL
	`

	row := s.DB.QueryRowContext(ctx, q, waNumber)
	var p Person
	if err := scanPerson(row, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (s PersonStore) List(ctx context.Context, limit, offset int) ([]Person, error) {
	if limit <= 0 {
		limit = 100
	} else if limit > 10000 {
		limit = 10000
	}
	if offset < 0 {
		offset = 0
	}

	const q = `
		SELECT id, full_name, gender, wa_number, alamat, url, img_url, father_id, mother_id, spouse_ids, generation, created_at, updated_at, deleted_at
		FROM persons
		WHERE deleted_at IS NULL
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`

	rows, err := s.DB.QueryContext(ctx, q, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var persons []Person
	for rows.Next() {
		var p Person
		if err := scanPerson(rows, &p); err != nil {
			return nil, err
		}
		persons = append(persons, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return persons, nil
}

func (s PersonStore) SearchByName(ctx context.Context, name string, limit int) ([]Person, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	const q = `
		SELECT id, full_name, gender, wa_number, alamat, url, img_url, father_id, mother_id, spouse_ids, generation, created_at, updated_at, deleted_at
		FROM persons
		WHERE deleted_at IS NULL
		  AND full_name ILIKE '%' || $1 || '%'
		ORDER BY created_at DESC
		LIMIT $2
	`

	rows, err := s.DB.QueryContext(ctx, q, name, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var persons []Person
	for rows.Next() {
		var p Person
		if err := scanPerson(rows, &p); err != nil {
			return nil, err
		}
		persons = append(persons, p)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return persons, nil
}

func (s PersonStore) Update(ctx context.Context, id string, input PersonInput) (*Person, error) {
	const q = `
		UPDATE persons
		SET
			full_name = $2,
			gender = $3,
			wa_number = $4,
			alamat = $5,
			url = $6,
			img_url = $7,
			father_id = $8,
			mother_id = $9,
			spouse_ids = COALESCE($10::int[], '{}'::int[]),
			generation = $11,
			updated_at = now()
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING id, full_name, gender, wa_number, alamat, url, img_url, father_id, mother_id, spouse_ids, generation, created_at, updated_at, deleted_at
	`

	row := s.DB.QueryRowContext(
		ctx,
		q,
		id,
		input.FullName,
		nullIfEmpty(input.Gender),
		nullIfEmpty(input.WANumber),
		nullIfEmpty(input.Alamat),
		nullIfEmpty(input.URL),
		nullIfEmpty(input.ImgURL),
		input.FatherID,
		input.MotherID,
		pgUUIDArray(input.SpouseIDs),
		nullIfEmpty(input.Generation),
	)

	var p Person
	if err := scanPerson(row, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

func (s PersonStore) UpdateWANumber(ctx context.Context, id string, waNumber string) error {
	const q = `
		UPDATE persons
		SET wa_number = $2, updated_at = now()
		WHERE id = $1 AND deleted_at IS NULL
	`
	_, err := s.DB.ExecContext(ctx, q, id, nullIfEmpty(waNumber))
	return err
}

func (s PersonStore) Delete(ctx context.Context, id string) error {
	const q = `
		UPDATE persons
		SET deleted_at = now()
		WHERE id = $1 AND deleted_at IS NULL
	`
	_, err := s.DB.ExecContext(ctx, q, id)
	return err
}

func (s PersonStore) EnsureImgURLColumn(ctx context.Context) error {
	const q = `ALTER TABLE persons ADD COLUMN IF NOT EXISTS img_url TEXT`
	_, err := s.DB.ExecContext(ctx, q)
	return err
}

func (s PersonStore) UpdateImgURL(ctx context.Context, id string, imgURL string) error {
	const q = `
		UPDATE persons
		SET img_url = $2, updated_at = now()
		WHERE id = $1 AND deleted_at IS NULL
	`
	_, err := s.DB.ExecContext(ctx, q, id, nullIfEmpty(imgURL))
	return err
}

type scanner interface {
	Scan(dest ...any) error
}

func scanPerson(row scanner, p *Person) error {
	var (
		genderNS     sql.NullString
		waNumberNS   sql.NullString
		alamatNS     sql.NullString
		urlNS        sql.NullString
		imgURLNS     sql.NullString
		spouseUUIDs  []string
		generationNS sql.NullString
		fatherNS     sql.NullString
		motherNS     sql.NullString
	)
	if err := row.Scan(
		&p.ID,
		&p.FullName,
		&genderNS,
		&waNumberNS,
		&alamatNS,
		&urlNS,
		&imgURLNS,
		&fatherNS,
		&motherNS,
		pq.Array(&spouseUUIDs),
		&generationNS,
		&p.CreatedAt,
		&p.UpdatedAt,
		&p.DeletedAt,
	); err != nil {
		return err
	}

	if genderNS.Valid {
		p.Gender = genderNS.String
	} else {
		p.Gender = ""
	}
	if waNumberNS.Valid {
		p.WANumber = waNumberNS.String
	} else {
		p.WANumber = ""
	}
	if alamatNS.Valid {
		p.Alamat = alamatNS.String
	} else {
		p.Alamat = ""
	}
	if urlNS.Valid {
		p.URL = urlNS.String
	} else {
		p.URL = ""
	}
	if imgURLNS.Valid {
		p.ImgURL = imgURLNS.String
	} else {
		p.ImgURL = ""
	}
	if generationNS.Valid {
		p.Generation = generationNS.String
	} else {
		p.Generation = ""
	}
	if fatherNS.Valid {
		v := fatherNS.String
		p.FatherID = &v
	} else {
		p.FatherID = nil
	}
	if motherNS.Valid {
		v := motherNS.String
		p.MotherID = &v
	} else {
		p.MotherID = nil
	}

	p.SpouseIDs = make([]string, 0, len(spouseUUIDs))
	for _, s := range spouseUUIDs {
		if s != "" {
			p.SpouseIDs = append(p.SpouseIDs, s)
		}
	}
	return nil
}

func nullIfEmpty(v string) any {
	if v == "" {
		return nil
	}
	return v
}

func pgUUIDArray(ids []string) any {
	if len(ids) == 0 {
		return nil
	}
	return pq.Array(ids)
}

type ParentCouple struct {
	ID           string `json:"id"`
	FatherID     string `json:"father_id"`
	FatherName   string `json:"father_name"`
	MotherID     string `json:"mother_id"`
	MotherName   string `json:"mother_name"`
	CoupleName   string `json:"couple_name"`
	ChildrenCount int    `json:"children_count"`
}

// GetParentCouples returns all valid parent couples (married male-female pairs)
func (s PersonStore) GetParentCouples(ctx context.Context) ([]ParentCouple, error) {
	const q = `
		SELECT 
			CONCAT(p1.id, ':', p2.id) as id,
			p1.id as father_id,
			p1.full_name as father_name,
			p2.id as mother_id,
			p2.full_name as mother_name,
			CONCAT(p1.full_name, ' & ', p2.full_name) as couple_name,
			COALESCE(COUNT(DISTINCT c.id), 0) as children_count
		FROM persons p1
		JOIN persons p2 ON p2.id = ANY(p1.spouse_ids)
		LEFT JOIN persons c ON c.father_id = p1.id AND c.mother_id = p2.id
		WHERE p1.deleted_at IS NULL 
		  AND p2.deleted_at IS NULL
		  AND p1.gender = 'Laki-laki'
		  AND p2.gender = 'Perempuan'
		GROUP BY p1.id, p1.full_name, p2.id, p2.full_name
		ORDER BY children_count DESC, p1.full_name, p2.full_name
	`

	rows, err := s.DB.QueryContext(ctx, q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var couples []ParentCouple
	for rows.Next() {
		var c ParentCouple
		if err := rows.Scan(
			&c.ID,
			&c.FatherID,
			&c.FatherName,
			&c.MotherID,
			&c.MotherName,
			&c.CoupleName,
			&c.ChildrenCount,
		); err != nil {
			return nil, err
		}
		couples = append(couples, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return couples, nil
}

// ValidateParentCouple checks if given father_id and mother_id form a valid couple
func (s PersonStore) ValidateParentCouple(ctx context.Context, fatherID, motherID *string) (bool, error) {
	if fatherID == nil || motherID == nil {
		return false, nil
	}

	const q = `
		SELECT EXISTS (
			SELECT 1
			FROM persons p1
			JOIN persons p2 ON p2.id = ANY(p1.spouse_ids)
			WHERE p1.id = $1 
			  AND p2.id = $2
			  AND p1.deleted_at IS NULL 
			  AND p2.deleted_at IS NULL
			  AND p1.gender = 'Laki-laki'
			  AND p2.gender = 'Perempuan'
		)
	`

	var exists bool
	err := s.DB.QueryRowContext(ctx, q, *fatherID, *motherID).Scan(&exists)
	return exists, err
}
