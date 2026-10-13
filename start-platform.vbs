Option Explicit
Dim shell, fileSystem, root, script, command
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
root = fileSystem.GetParentFolderName(WScript.ScriptFullName)
script = fileSystem.BuildPath(root, "scripts\service.ps1")
command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & Chr(34) & script & Chr(34) & " -Action Start"
shell.Run command, 0, False
