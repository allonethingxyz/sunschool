#!/usr/bin/env bash
# block-dangerous-commands.sh — Pre-execution hook to block destructive patterns
# Exit 1 = block, Exit 0 = allow
CMD="$1"

# Block destructive filesystem operations
[[ "$CMD" =~ rm\ -rf\ / ]] && exit 1
[[ "$CMD" =~ rm\ -rf\ /\* ]] && exit 1
[[ "$CMD" =~ sudo\  ]] && exit 1
[[ "$CMD" =~ eval\  ]] && exit 1
[[ "$CMD" =~ dd\ if= ]] && exit 1

# Block piped execution
[[ "$CMD" =~ curl.*\|.*sh ]] && exit 1
[[ "$CMD" =~ wget.*\|.*bash ]] && exit 1

# Block force push
[[ "$CMD" =~ git\ push\ --force ]] && exit 1
[[ "$CMD" =~ git\ push\ -f ]] && exit 1

# Block publishing
[[ "$CMD" =~ npm\ publish ]] && exit 1

# Block insecure permissions
[[ "$CMD" =~ chmod\ 777 ]] && exit 1

exit 0
