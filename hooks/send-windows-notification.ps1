# Sends a notification using the Windows notification system, attempting to get the user's attention
#
# Only fires when Claude actually wants something from you:
#   - Stop                  -> "finished", but suppressed while subagents are still running
#   - Notification          -> "needs input", scoped by matcher to the types that mean a prompt is waiting
#   - SubagentStart/Stop     -> silent; they only track how many subagents are in flight
#   - SessionStart          -> silent; clears stale tracking state from a crashed session
#
# The subagent tracking is what stops the false "all done" notification in auto mode: the main agent
# ends its turn as soon as it has handed work to subagents, so a bare Stop hook fires long before the
# work is actually finished. Each subagent gets a marker file keyed by its agent_id, and Stop stays
# quiet until every marker is gone.
#
# Tested with Claude Code. Use with:
#
# "hooks": {
#   "SessionStart": [
#     {
#       "matcher": "",
#       "hooks": [
#         {
#           "type": "command",
#           "command": "powershell.exe -ExecutionPolicy Bypass -File \"$HOME/.claude/hooks/send-windows-notification.ps1\""
#         }
#       ]
#     }
#   ],
#   "SubagentStart": [
#     {
#       "matcher": "",
#       "hooks": [
#         {
#           "type": "command",
#           "command": "powershell.exe -ExecutionPolicy Bypass -File \"$HOME/.claude/hooks/send-windows-notification.ps1\""
#         }
#       ]
#     }
#   ],
#   "SubagentStop": [
#     {
#       "matcher": "",
#       "hooks": [
#         {
#           "type": "command",
#           "command": "powershell.exe -ExecutionPolicy Bypass -File \"$HOME/.claude/hooks/send-windows-notification.ps1\""
#         }
#       ]
#     }
#   ],
#   "Stop": [
#     {
#       "matcher": "",
#       "hooks": [
#         {
#           "type": "command",
#           "command": "powershell.exe -ExecutionPolicy Bypass -File \"$HOME/.claude/hooks/send-windows-notification.ps1\""
#         }
#       ]
#     }
#   ],
#   "Notification": [
#     {
#       "matcher": "permission_prompt|elicitation_dialog|elicitation_url_dialog|agent_needs_input",
#       "hooks": [
#         {
#           "type": "command",
#           "command": "powershell.exe -ExecutionPolicy Bypass -File \"$HOME/.claude/hooks/send-windows-notification.ps1\""
#         }
#       ]
#     }
#   ]
# }
#
# Note the Notification matcher deliberately omits `idle_prompt`. That type fires after 60 seconds of an
# idle prompt, which includes every stretch where the main agent is waiting on background work, so it is
# the other big source of "is it my turn?" false alarms. The Stop hook covers the genuine case.

param(
  [string]$Title = "Claude Code"
)

$payload = $null
try {
  $raw = [Console]::In.ReadToEnd()
  if ($raw) { $payload = $raw | ConvertFrom-Json }
} catch {
  $payload = $null
}

$hookEvent = if ($payload) { $payload.hook_event_name } else { $null }
$sessionId = if ($payload -and $payload.session_id) { $payload.session_id } else { "unknown" }
$trackingDirectory = Join-Path $env:TEMP "claude-pending-subagents\$sessionId"

function Get-PendingSubagentCount {
  if (Test-Path $trackingDirectory) {
    @(Get-ChildItem -Path $trackingDirectory -File -ErrorAction SilentlyContinue).Count
  } else {
    0
  }
}

$text = $null

switch ($hookEvent) {
  "SessionStart" {
    Remove-Item -Path $trackingDirectory -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
  }
  "SubagentStart" {
    # A missing agent_id means we cannot pair this start with its stop, so skip tracking rather than
    # leak a marker that would silence the Stop notification for the rest of the session.
    if ($payload.agent_id) {
      New-Item -Path $trackingDirectory -ItemType Directory -Force | Out-Null
      New-Item -Path (Join-Path $trackingDirectory $payload.agent_id) -ItemType File -Force | Out-Null
    }
    exit 0
  }
  "SubagentStop" {
    if ($payload.agent_id) {
      Remove-Item -Path (Join-Path $trackingDirectory $payload.agent_id) -Force -ErrorAction SilentlyContinue
    }
    exit 0
  }
  "Stop" {
    if ((Get-PendingSubagentCount) -gt 0) { exit 0 }
    $text = "Claude has finished."
  }
  "Notification" {
    $text = switch ($payload.notification_type) {
      "permission_prompt"      { "Claude needs permission to continue..." }
      "elicitation_dialog"     { "Claude needs your input..." }
      "elicitation_url_dialog" { "Claude needs your input..." }
      "agent_needs_input"      { "An agent needs your input..." }
      default                  { "An agent is waiting for your response..." }
    }
  }
  default {
    $text = "An agent is waiting for your response..."
  }
}

Add-Type -AssemblyName System.Windows.Forms
$balloon = New-Object System.Windows.Forms.NotifyIcon
$balloon.Icon = [System.Drawing.SystemIcons]::Information
$balloon.BalloonTipTitle = $Title
$balloon.BalloonTipText = $text
$balloon.Visible = $true
$balloon.ShowBalloonTip(5000)
Start-Sleep -Seconds 6
$balloon.Dispose()
