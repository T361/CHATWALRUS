#!/bin/bash
# Run schema.sql against the remote Supabase project using the SQL endpoint
# This uses the Supabase Management API's pg-meta SQL execution endpoint

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SQL_FILE="$SCRIPT_DIR/schema.sql"

# Load env from .env.local
ENV_FILE="$SCRIPT_DIR/../.env.local"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env.local not found at $ENV_FILE"
  exit 1
fi

# Source env vars (handle lines with comments and blank lines)
export $(grep -v '^#' "$ENV_FILE" | grep -v '^\s*$' | xargs)

if [ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
  exit 1
fi

echo "Reading SQL from: $SQL_FILE"
SQL_CONTENT=$(cat "$SQL_FILE")

echo "Executing migration against: $NEXT_PUBLIC_SUPABASE_URL"
echo "---"

# Use the pg-meta /query endpoint to execute raw SQL
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${NEXT_PUBLIC_SUPABASE_URL}/pg/query" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg sql "$SQL_CONTENT" '{query: $sql}')")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ]; then
  echo "✅ Migration executed successfully (HTTP $HTTP_CODE)"
  echo "$BODY" | head -5
else
  echo "❌ Migration failed (HTTP $HTTP_CODE)"
  echo "$BODY"
  
  # If pg/query doesn't work, try the /rest/v1/rpc approach or direct pg-meta
  echo ""
  echo "Trying alternative endpoint..."
  
  RESPONSE2=$(curl -s -w "\n%{http_code}" \
    -X POST "${NEXT_PUBLIC_SUPABASE_URL}/pg-meta/default/query" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "$(jq -n --arg sql "$SQL_CONTENT" '{query: $sql}')")
  
  HTTP_CODE2=$(echo "$RESPONSE2" | tail -1)
  BODY2=$(echo "$RESPONSE2" | sed '$d')
  
  if [ "$HTTP_CODE2" = "200" ] || [ "$HTTP_CODE2" = "201" ]; then
    echo "✅ Migration executed successfully via pg-meta (HTTP $HTTP_CODE2)"
    echo "$BODY2" | head -5
  else
    echo "❌ Alternative also failed (HTTP $HTTP_CODE2)"
    echo "$BODY2"
    echo ""
    echo "Please run the SQL manually in the Supabase Dashboard SQL Editor:"
    echo "  1. Go to https://supabase.com/dashboard/project/gerqhcikfkoykgadoaah/sql/new"
    echo "  2. Paste the contents of supabase/schema.sql"
    echo "  3. Click 'Run'"
  fi
fi
