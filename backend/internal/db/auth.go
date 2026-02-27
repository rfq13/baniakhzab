package db

import (
	"context"
	"database/sql"
	"time"
)

type WAToken struct {
	ID        string
	WANumber  string
	Token     string
	ExpiresAt time.Time
	UsedAt    *time.Time
	CreatedAt time.Time
}

type WATokenStore struct {
	DB *sql.DB
}

func (s WATokenStore) CreateOneTime(ctx context.Context, waNumber, token string, expiresAt time.Time) (*WAToken, error) {
	const q = `
		INSERT INTO wa_auth_tokens (wa_number, one_time_token, expires_at)
		VALUES ($1, $2, $3)
		RETURNING id, wa_number, one_time_token, expires_at, used_at, created_at
	`

	row := s.DB.QueryRowContext(ctx, q, waNumber, token, expiresAt)
	var t WAToken
	if err := row.Scan(&t.ID, &t.WANumber, &t.Token, &t.ExpiresAt, &t.UsedAt, &t.CreatedAt); err != nil {
		return nil, err
	}
	return &t, nil
}

func (s WATokenStore) GetValid(ctx context.Context, token string, now time.Time) (*WAToken, error) {
	const q = `
		SELECT id, wa_number, one_time_token, expires_at, used_at, created_at
		FROM wa_auth_tokens
		WHERE one_time_token = $1
		  AND used_at IS NULL
		  AND expires_at >= $2
	`

	row := s.DB.QueryRowContext(ctx, q, token, now)
	var t WAToken
	if err := row.Scan(&t.ID, &t.WANumber, &t.Token, &t.ExpiresAt, &t.UsedAt, &t.CreatedAt); err != nil {
		return nil, err
	}
	return &t, nil
}

func (s WATokenStore) MarkUsed(ctx context.Context, id string, usedAt time.Time) error {
	const q = `
		UPDATE wa_auth_tokens
		SET used_at = $2
		WHERE id = $1 AND used_at IS NULL
	`
	_, err := s.DB.ExecContext(ctx, q, id, usedAt)
	return err
}

