export function generateRuntimeCore(): string {
  return `set -uo pipefail

if [[ -z "@{BASH_VERSION:-}" ]]; then
  echo "This script requires bash." >&2
  exit 1
fi

RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
CYAN='\\033[0;36m'
BOLD='\\033[1m'
DIM='\\033[2m'
NC='\\033[0m'

log_info()  { printf "%b[INFO]%b  %s\\n" "$CYAN" "$NC" "$*"; }
log_ok()    { printf "%b[OK]%b    %s\\n" "$GREEN" "$NC" "$*"; }
log_warn()  { printf "%b[WARN]%b  %s\\n" "$YELLOW" "$NC" "$*"; }
log_error() { printf "%b[ERROR]%b %s\\n" "$RED" "$NC" "$*"; }`;
}
