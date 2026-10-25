$WshShell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$projectRoot = Split-Path -Parent $PSScriptRoot

$shortcutPath = Join-Path $desktop "Habblaud.lnk"
$exePath = Join-Path $projectRoot "Habblaud.exe"
$icoPath = Join-Path $projectRoot "habblaud.ico"

$shortcut = $WshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $exePath
$shortcut.WorkingDirectory = $projectRoot
$shortcut.IconLocation = "$icoPath, 0"
$shortcut.Description = "Habblaud - Escritório Virtual para Agentes de IA"
$shortcut.Save()

Write-Host "Atalho criado na Área de Trabalho: $shortcutPath"
