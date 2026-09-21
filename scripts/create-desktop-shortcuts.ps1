$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$shell = New-Object -ComObject WScript.Shell

function New-AwfShortcut {
    param(
        [string]$Name,
        [string]$BatchFile,
        [string]$Description
    )

    $shortcutPath = Join-Path $desktop ($Name + ".lnk")
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = $env:ComSpec
    $targetBatch = Join-Path $root $BatchFile
    $shortcut.Arguments = '/c ""' + $targetBatch + '""'
    $shortcut.WorkingDirectory = $root
    $shortcut.Description = $Description
    $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,220"
    $shortcut.Save()
}

New-AwfShortcut -Name "AI Web Factory" -BatchFile "start-ai-web-factory.bat" -Description "AI Web Factoryを起動"
New-AwfShortcut -Name "AI Web Factory 終了" -BatchFile "stop-ai-web-factory.bat" -Description "AI Web Factoryを終了"
