#!/usr/bin/env bash
#
# MIT License
# Copyright (c) 2026 Ronan Le Meillat - SCTG Development
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.
#
# =============================================================================
# valid_and_correct_apple_p12.sh
# =============================================================================
#
# Checks every .p12 bundle under .github/workflows/secrets/ for a complete
# Apple certificate chain (leaf -> WWDR intermediate -> Apple Root CA) and
# repairs any bundle that is missing a link by fetching the missing CA
# certificate from apple.com and re-exporting the .p12 with it included.
#
# Each .p12 is protected by the password held in the CRYPTOKEN environment
# variable (or the CRYPTOKEN= line of the repo .env file).
#
# Usage: ./scripts/valid_and_correct_apple_p12.sh [-n|--dry-run] [-d dir]

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SECRETS_DIR="$REPO_ROOT/.github/workflows/secrets"
ENV_FILE="$REPO_ROOT/.env"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--dry-run) DRY_RUN=1; shift ;;
    -d|--dir) SECRETS_DIR="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: $0 [-n|--dry-run] [-d <secrets-dir>]"
      exit 0
      ;;
    *) echo "error: unknown argument: $1" >&2; exit 1 ;;
  esac
done

log()  { printf '[valid_and_correct_apple_p12] %s\n' "$*"; }
warn() { printf '[valid_and_correct_apple_p12] warning: %s\n' "$*" >&2; }
die()  { printf '[valid_and_correct_apple_p12] error: %s\n' "$*" >&2; exit 1; }

command -v openssl >/dev/null 2>&1 || die "openssl not found in PATH"
command -v curl >/dev/null 2>&1 || die "curl not found in PATH"

[[ -d "$SECRETS_DIR" ]] || die "secrets directory not found: $SECRETS_DIR"

# --- load CRYPTOKEN ----------------------------------------------------------
if [[ -z "${CRYPTOKEN:-}" && -f "$ENV_FILE" ]]; then
  CRYPTOKEN="$(grep -E '^CRYPTOKEN=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
fi
[[ -n "${CRYPTOKEN:-}" ]] || die "CRYPTOKEN is not set (export it or add it to $ENV_FILE)"

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

# --- known Apple CA certificates (all live root + WWDR intermediate generations)
APPLE_CA_URLS=(
  "https://www.apple.com/appleca/AppleIncRootCertificate.cer"
  "https://www.apple.com/certificateauthority/AppleRootCA-G2.cer"
  "https://www.apple.com/certificateauthority/AppleRootCA-G3.cer"
  "https://www.apple.com/certificateauthority/AppleWWDRCAG2.cer"
  "https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer"
  "https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer"
  "https://www.apple.com/certificateauthority/AppleWWDRCAG5.cer"
  "https://www.apple.com/certificateauthority/AppleWWDRCAG6.cer"
)

CA_POOL_DIR="$WORKDIR/ca-pool"
mkdir -p "$CA_POOL_DIR"

fetch_ca_pool() {
  local url name der pem i=0
  for url in "${APPLE_CA_URLS[@]}"; do
    i=$((i + 1))
    name="$(basename "$url")"
    der="$CA_POOL_DIR/${i}_${name}"
    pem="$CA_POOL_DIR/${i}.pem"
    if ! curl -fsSL --retry 2 --max-time 20 -o "$der" "$url" 2>/dev/null; then
      warn "could not download $name (network issue or Apple moved the file)"
      continue
    fi
    if ! openssl x509 -inform DER -in "$der" -outform PEM -out "$pem" 2>/dev/null; then
      warn "downloaded $name is not a valid DER certificate, skipping"
      rm -f "$pem"
    fi
  done
}

log "fetching Apple CA pool (root + WWDR intermediates)..."
fetch_ca_pool

# subject_hash -> pem path, for every cert available locally in the pool
find_ca_by_subject_hash() {
  local wanted="$1" pem
  for pem in "$CA_POOL_DIR"/*.pem; do
    [[ -f "$pem" ]] || continue
    if [[ "$(openssl x509 -in "$pem" -noout -subject_hash 2>/dev/null)" == "$wanted" ]]; then
      echo "$pem"
      return 0
    fi
  done
  return 1
}

# Splits a PEM bundle (as produced by `openssl pkcs12 -nokeys -nodes`) into
# one file per certificate under $2.
split_certs() {
  local bundle="$1" outdir="$2"
  mkdir -p "$outdir"
  awk -v outdir="$outdir" '
    /-----BEGIN CERTIFICATE-----/ { n++; file = outdir "/cert_" n ".pem" }
    file { print > file }
    /-----END CERTIFICATE-----/ { close(file); file = "" }
  ' "$bundle"
}

EXIT_CODE=0

process_p12() {
  local p12="$1"
  local base; base="$(basename "$p12")"
  local work; work="$(mktemp -d "$WORKDIR/${base}.XXXXXX")"

  log "checking $base"

  if ! openssl pkcs12 -legacy -in "$p12" -passin "pass:$CRYPTOKEN" -nokeys -nodes \
      -out "$work/all_certs.pem" 2>"$work/err.log"; then
    warn "$base: cannot open with CRYPTOKEN ($(tail -1 "$work/err.log"))"
    EXIT_CODE=1
    return
  fi

  split_certs "$work/all_certs.pem" "$work/certs"

  # Index what we currently have, and figure out which issuer hashes are unmet.
  # Bash 3.2 (macOS default /bin/bash) has no associative arrays, so track the
  # two sets as newline-delimited files instead.
  local have_subject_file="$work/have_subject.txt"
  local need_issuer_file="$work/need_issuer.txt"
  : > "$have_subject_file"
  : > "$need_issuer_file"
  local cert sh ih

  for cert in "$work/certs"/*.pem; do
    [[ -f "$cert" ]] || continue
    sh="$(openssl x509 -in "$cert" -noout -subject_hash 2>/dev/null || true)"
    [[ -n "$sh" ]] || continue
    ih="$(openssl x509 -in "$cert" -noout -issuer_hash 2>/dev/null || true)"
    grep -qxF "$sh" "$have_subject_file" 2>/dev/null || echo "$sh" >> "$have_subject_file"
    if [[ "$sh" != "$ih" ]]; then
      grep -qxF "$ih" "$need_issuer_file" 2>/dev/null || echo "$ih" >> "$need_issuer_file"
    fi
  done

  # Resolve missing links from the Apple CA pool, repeatedly (an added
  # intermediate may itself need its own issuer added).
  local added=0
  local progress=1
  while [[ $progress -eq 1 ]]; do
    progress=0
    while IFS= read -r ih; do
      [[ -n "$ih" ]] || continue
      if grep -qxF "$ih" "$have_subject_file"; then
        continue
      fi
      local found
      if found="$(find_ca_by_subject_hash "$ih")"; then
        local next_n; next_n="$(find "$work/certs" -maxdepth 1 -name 'cert_*.pem' | wc -l | tr -d ' ')"
        next_n=$((next_n + 1))
        cp "$found" "$work/certs/cert_${next_n}.pem"
        echo "$ih" >> "$have_subject_file"
        added=1
        progress=1
        local new_sh new_ih new_subj
        new_sh="$(openssl x509 -in "$found" -noout -subject_hash)"
        new_ih="$(openssl x509 -in "$found" -noout -issuer_hash)"
        new_subj="$(openssl x509 -in "$found" -noout -subject | sed 's/^subject=//')"
        if [[ "$new_sh" != "$new_ih" ]]; then
          grep -qxF "$new_ih" "$need_issuer_file" 2>/dev/null || echo "$new_ih" >> "$need_issuer_file"
        fi
        log "  + adding missing certificate: $new_subj"
      fi
    done < "$need_issuer_file"
  done

  # Anything still unresolved?
  local missing=0
  while IFS= read -r ih; do
    [[ -n "$ih" ]] || continue
    if ! grep -qxF "$ih" "$have_subject_file"; then
      warn "$base: missing CA certificate for issuer_hash=$ih and it is not in the known Apple CA pool"
      missing=1
    fi
  done < "$need_issuer_file"

  if [[ $added -eq 0 ]]; then
    log "  ok: chain already complete"
    if [[ $missing -eq 1 ]]; then
      EXIT_CODE=1
    fi
    return
  fi

  if [[ $missing -eq 1 ]]; then
    warn "$base: chain still incomplete after adding available certificates"
    EXIT_CODE=1
  fi

  if [[ $DRY_RUN -eq 1 ]]; then
    log "  dry-run: would rewrite $base with the certificate(s) above"
    return
  fi

  # Rebuild the .p12 with the completed chain, keeping the same password.
  if ! openssl pkcs12 -legacy -in "$p12" -passin "pass:$CRYPTOKEN" -nocerts -nodes \
      -out "$work/key.pem" 2>"$work/err.log"; then
    warn "$base: could not extract private key, leaving file untouched ($(tail -1 "$work/err.log"))"
    EXIT_CODE=1
    return
  fi
  if ! openssl pkcs12 -legacy -in "$p12" -passin "pass:$CRYPTOKEN" -clcerts -nokeys \
      -out "$work/leaf.pem" 2>"$work/err.log"; then
    warn "$base: could not extract leaf certificate, leaving file untouched ($(tail -1 "$work/err.log"))"
    EXIT_CODE=1
    return
  fi

  local leaf_sh; leaf_sh="$(openssl x509 -in "$work/leaf.pem" -noout -subject_hash)"
  : > "$work/chain.pem"
  for cert in "$work/certs"/*.pem; do
    [[ -f "$cert" ]] || continue
    sh="$(openssl x509 -in "$cert" -noout -subject_hash 2>/dev/null || true)"
    if [[ "$sh" == "$leaf_sh" ]]; then
      continue
    fi
    cat "$cert" >> "$work/chain.pem"
  done

  if ! openssl pkcs12 -legacy -export \
      -inkey "$work/key.pem" -in "$work/leaf.pem" -certfile "$work/chain.pem" \
      -passout "pass:$CRYPTOKEN" -out "$work/new.p12" 2>"$work/err.log"; then
    warn "$base: failed to re-export .p12, leaving file untouched ($(tail -1 "$work/err.log"))"
    EXIT_CODE=1
    return
  fi

  # Sanity check the rebuilt bundle opens with the same password before
  # touching the original file.
  if ! openssl pkcs12 -legacy -in "$work/new.p12" -passin "pass:$CRYPTOKEN" -noout 2>"$work/err.log"; then
    warn "$base: rebuilt .p12 failed to verify, leaving original file untouched"
    EXIT_CODE=1
    return
  fi

  local backup="${p12}.bak-$(date +%Y%m%d%H%M%S 2>/dev/null || echo backup)"
  cp -p "$p12" "$backup"
  cp "$work/new.p12" "$p12"
  chmod 600 "$p12"
  log "  fixed: $base rewritten (backup at $(basename "$backup"))"
}

shopt -s nullglob
p12_files=("$SECRETS_DIR"/*.p12)
shopt -u nullglob
[[ ${#p12_files[@]} -gt 0 ]] || die "no .p12 files found in $SECRETS_DIR"

for p12 in "${p12_files[@]}"; do
  process_p12 "$p12"
done

exit $EXIT_CODE
