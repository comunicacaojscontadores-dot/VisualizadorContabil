WScript.Sleep 6000
Dim ie
Set ie = CreateObject("WScript.Shell")
ie.Run "cmd /c start http://localhost:3000", 0, False
