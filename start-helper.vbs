Option Explicit

Dim shell, fileSystem, root, result
Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")
root = fileSystem.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root

On Error Resume Next
result = shell.Run("node.exe launcher.mjs --background", 0, True)
If Err.Number <> 0 Then
  shell.Popup "Node.js 20 or newer is required. Run the CMD launcher for details.", 0, "DoL Helper", 16
  WScript.Quit 1
End If

If result <> 0 Then
  shell.Popup "The helper could not start. See logs\startup.log for details.", 0, "DoL Helper", 16
  WScript.Quit result
End If

WScript.Quit 0
