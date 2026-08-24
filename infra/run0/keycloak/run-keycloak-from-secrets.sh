#!/usr/bin/env bash
set -euo pipefail

read_secret() {
  local destination="$1"
  local source_path="$2"

  if [[ ! -f "$source_path" || -L "$source_path" ]]; then
    printf 'Run-0 Keycloak secret file is unavailable\n' >&2
    exit 78
  fi

  local value
  IFS= read -r value <"$source_path"
  if [[ -z "$value" ]]; then
    printf 'Run-0 Keycloak secret file is empty\n' >&2
    exit 78
  fi

  printf -v "$destination" '%s' "$value"
  export "$destination"
}

read_secret KC_DB_PASSWORD "${SCIFORGE_RUN0_KEYCLOAK_DB_PASSWORD_FILE:?missing DB password file reference}"
read_secret KC_BOOTSTRAP_ADMIN_USERNAME "${SCIFORGE_RUN0_KEYCLOAK_ADMIN_USERNAME_FILE:?missing admin username file reference}"
read_secret KC_BOOTSTRAP_ADMIN_PASSWORD "${SCIFORGE_RUN0_KEYCLOAK_ADMIN_PASSWORD_FILE:?missing admin password file reference}"

exec /opt/keycloak/bin/kc.sh start --import-realm
