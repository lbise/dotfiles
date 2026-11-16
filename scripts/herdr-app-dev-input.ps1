# Pointer input for the development Herdr window (scripts/herdr-app-dev): posts
# mouse messages to that window only, so the real cursor and the daily window
# are untouched. Coordinates are the window's client pixels, as in its shot.
param([int]$procId, [string]$action, [int]$x = 0, [int]$y = 0, [int]$delta = 0, [int]$width = 1280, [int]$height = 820)
Add-Type @"
using System; using System.Runtime.InteropServices;
public static class HerdrDevInput {
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h, ref POINT p);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
}
"@
$h = (Get-Process -Id $procId -ErrorAction Stop).MainWindowHandle
if ($h -eq [IntPtr]::Zero) { throw "process $procId has no window" }
function Pack([int]$a, [int]$b) { [IntPtr](($b -shl 16) -bor ($a -band 0xffff)) }
$screen = New-Object HerdrDevInput+POINT
$screen.X = $x; $screen.Y = $y
[void][HerdrDevInput]::ClientToScreen($h, [ref]$screen)
$move = { [void][HerdrDevInput]::PostMessage($h, 0x0200, [IntPtr]0, (Pack $x $y)); Start-Sleep -Milliseconds 150 }
# A wheel message carries screen coordinates; its delta is in the high word (120 per notch).
$wheel = { param($message) & $move
  [void][HerdrDevInput]::PostMessage($h, $message, [IntPtr]([int](($delta -band 0xffff) -shl 16)), (Pack $screen.X $screen.Y)) }
switch ($action) {
  "move"   { & $move }
  "click"  { & $move
             [void][HerdrDevInput]::PostMessage($h, 0x0201, [IntPtr]1, (Pack $x $y)); Start-Sleep -Milliseconds 30
             [void][HerdrDevInput]::PostMessage($h, 0x0202, [IntPtr]0, (Pack $x $y)) }
  "wheel"  { & $wheel 0x020A }
  "hwheel" { & $wheel 0x020E }
  # The window's place (screen pixels) and size, without taking focus.
  "place"  { [void][HerdrDevInput]::SetWindowPos($h, [IntPtr]0, $x, $y, $width, $height, 0x0014) }
  default  { throw "unknown action: $action" }
}
