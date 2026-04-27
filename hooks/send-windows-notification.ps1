# Sends a notification using the Windows notification system, attempting to get the user's attention
#
# Tested with Claude Code. Use with:
#
# "hooks": {
#   "Notification": [
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
# }


Add-Type -AssemblyName System.Windows.Forms
$balloon = New-Object System.Windows.Forms.NotifyIcon
$balloon.Icon = [System.Drawing.SystemIcons]::Information
$balloon.BalloonTipTitle = "Claude Code"
$balloon.BalloonTipText = "An agent is waiting for your response..."
$balloon.Visible = $true
$balloon.ShowBalloonTip(5000)
Start-Sleep -Seconds 6
$balloon.Dispose()
