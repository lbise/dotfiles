param(
  [Parameter(Mandatory = $false)]
  [string] $HandlerPath = "",

  # Fast path for the current WSL-local POC. When set, Windows registers a tiny
  # hidden WScript bridge that calls wsl.exe directly instead of launching a
  # visible powershell.exe window and waiting for it.
  [Parameter(Mandatory = $false)]
  [string] $WslDistro = $env:WSL_DISTRO_NAME,

  [Parameter(Mandatory = $false)]
  [string] $WslHandler = "",

  [Parameter(Mandatory = $false)]
  [switch] $UsePowerShellHandler
)

$scriptRoot = $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($scriptRoot)) {
  $scriptPath = $PSCommandPath
  if ([string]::IsNullOrWhiteSpace($scriptPath)) {
    $scriptPath = $MyInvocation.MyCommand.Path
  }
  if (-not [string]::IsNullOrWhiteSpace($scriptPath)) {
    $scriptRoot = Split-Path -Parent $scriptPath
  }
}

if ([string]::IsNullOrWhiteSpace($WslDistro) -and $scriptRoot -match '^\\\\wsl(?:\.localhost|\$)\\([^\\]+)\\') {
  $WslDistro = $Matches[1]
}
if ([string]::IsNullOrWhiteSpace($WslHandler) -and $scriptRoot -match '^\\\\wsl(?:\.localhost|\$)\\[^\\]+\\home\\([^\\]+)\\') {
  $WslHandler = "/home/$($Matches[1])/.scripts/pi-open-handler"
}
if ([string]::IsNullOrWhiteSpace($WslHandler)) {
  $WslHandler = "/home/$env:USERNAME/.scripts/pi-open-handler"
}

$schemeKey = "HKCU:\Software\Classes\pi-open"
$commandKey = Join-Path $schemeKey "shell\open\command"

if (-not $UsePowerShellHandler -and -not [string]::IsNullOrWhiteSpace($WslDistro)) {
  $bridgeDir = Join-Path $env:LOCALAPPDATA "pi-open-handler"
  $bridgePath = Join-Path $bridgeDir "pi-open-wsl.vbs"
  New-Item -ItemType Directory -Force -Path $bridgeDir | Out-Null

  $vbsDistro = $WslDistro.Replace('"', '""')
  $vbsHandler = $WslHandler.Replace('"', '""')
  $vbs = @"
Option Explicit
Dim url, distro, handler, q, shell, cmd
If WScript.Arguments.Count = 0 Then WScript.Quit 2
url = WScript.Arguments(0)
distro = "$vbsDistro"
handler = "$vbsHandler"
q = Chr(34)
Set shell = CreateObject("WScript.Shell")
cmd = "wsl.exe -d " & distro & " -e /bin/bash " & handler & " " & WinQuote(url)
shell.Run cmd, 0, True

Function WinQuote(s)
  WinQuote = q & Replace(s, q, "\" & q) & q
End Function
"@
  Set-Content -Path $bridgePath -Value $vbs -Encoding ASCII
  $command = "wscript.exe //B //Nologo `"$bridgePath`" `"%1`""
  $registeredHandler = $bridgePath
} else {
  if ([string]::IsNullOrWhiteSpace($HandlerPath)) {
    if ([string]::IsNullOrWhiteSpace($scriptRoot)) {
      throw "Could not determine script directory. Pass -HandlerPath explicitly."
    }
    $HandlerPath = Join-Path $scriptRoot "pi-open-handler.ps1"
  }

  $resolvedHandlerPath = Resolve-Path $HandlerPath
  $resolvedHandler = $resolvedHandlerPath.ProviderPath
  if ([string]::IsNullOrWhiteSpace($resolvedHandler)) {
    $resolvedHandler = $resolvedHandlerPath.Path -replace '^Microsoft\.PowerShell\.Core\\FileSystem::', ''
  }
  $command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$resolvedHandler`" `"%1`""
  $registeredHandler = $resolvedHandler
}

New-Item -Force -Path $schemeKey | Out-Null
Set-Item -Path $schemeKey -Value "URL:pi-open Protocol"
New-ItemProperty -Force -Path $schemeKey -Name "URL Protocol" -Value "" | Out-Null
New-Item -Force -Path $commandKey | Out-Null
Set-Item -Path $commandKey -Value $command

Write-Host "Registered pi-open:// handler: $registeredHandler"
Write-Host "Command: $command"
if (-not [string]::IsNullOrWhiteSpace($WslDistro) -and -not $UsePowerShellHandler) {
  Write-Host "WSL distro: $WslDistro"
  Write-Host "WSL handler: $WslHandler"
}
Write-Host "Test from Windows Run dialog or PowerShell: start 'pi-open://echo?wslDistro=$WslDistro&message=hello'"
