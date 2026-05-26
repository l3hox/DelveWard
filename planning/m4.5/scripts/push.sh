#!/bin/bash
# planning/m4.5/scripts/push.sh
#
# The only permitted push from the M4.5 autonomous run.
# Hard-codes origin main; refuses everything else.

set -euo pipefail

exec git push origin refs/heads/main:refs/heads/main "$@"
