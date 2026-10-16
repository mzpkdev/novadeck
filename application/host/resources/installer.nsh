# Included by electron-builder into the installer and the uninstaller (the default
# `installer.nsh` of the build resources). Its `customCheckAppRunning` replaces
# builder's own running-app check (`CHECK_APP_RUNNING`), which ends up stopping every
# process named novadeck.exe by name where PowerShell is not usable. That would close a
# portable copy running from another folder, and a portable copy installs itself by
# running this setup silently while it keeps running. See docs/auto-update.md.
#
# One rule, in terms of the install folder alone:
#   - Novadeck is running from $INSTDIR when its executable there cannot be opened for
#     writing. Nothing else counts, so a copy running from any other folder never does.
#   - A silent run that is not a self-update (`--updated`) closes nothing: it ends with
#     exit code 2, leaving the install as it was. A portable copy's install is that run.
#   - A self-update gives the quitting app a moment, then closes what still runs from
#     $INSTDIR. An interactive run asks first, then does the same.
#   - Only processes whose path is inside "$INSTDIR\" are closed, by PowerShell, never
#     by name, and never this setup itself. Without PowerShell nothing is closed: the
#     person is asked to close Novadeck, or a silent run ends.
#
# Everything is inline: the uninstaller uses this macro too, where a plain Function
# could not be called.

!macro customCheckAppRunning
  Push $0
  Push $1
  Push $2
  Push $3

  # What the PowerShell command below reads, instead of quoting a path into it.
  System::Call 'kernel32::GetCurrentProcessId() i .r0'
  System::Call 'kernel32::SetEnvironmentVariable(t "NOVADECK_SETUP_PID", t "$0")'
  System::Call 'kernel32::SetEnvironmentVariable(t "NOVADECK_INSTALL_DIR", t "$INSTDIR")'

  StrCpy $2 0 # rounds waited for the app to go
  ${Do}
    # $1 = 1 while the installed executable is in use.
    StrCpy $1 0
    ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      ClearErrors
      FileOpen $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" a
      ${If} ${Errors}
        StrCpy $1 1
      ${Else}
        FileClose $0
      ${EndIf}
    ${EndIf}
    ${If} $1 == 0
      ${ExitDo}
    ${EndIf}

    IntOp $2 $2 + 1

    ${If} ${isUpdated}
      # The app that started this update is quitting; give it time before closing.
      Sleep 1000
    ${ElseIf} ${Silent}
      # Nobody to ask, and the running copy may be a portable one the person is using.
      SetErrorLevel 2
      Quit
    ${Else}
      ${If} $2 == 1
        MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" /SD IDOK IDOK +2
        Quit
        DetailPrint "$(appClosing)"
      ${EndIf}
    ${EndIf}

    ${If} $2 > 1
    ${OrIfNot} ${isUpdated}
      # Politely on the first round, by force after that.
      ${If} $2 > 2
        StrCpy $3 "Stop-Process -Id $$_.ProcessId -Force"
      ${Else}
        StrCpy $3 "(Get-Process -Id $$_.ProcessId -ErrorAction SilentlyContinue).CloseMainWindow()"
      ${EndIf}
      ${If} ${FileExists} "$PowerShellPath"
        nsExec::Exec `"$PowerShellPath" -NoProfile -NonInteractive -C "$$d = $$env:NOVADECK_INSTALL_DIR.TrimEnd('\') + '\'; Get-CimInstance -ClassName Win32_Process | Where-Object { $$_.ExecutablePath -and $$_.ProcessId -ne [int]$$env:NOVADECK_SETUP_PID -and $$_.ExecutablePath.StartsWith($$d, [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { $3 }"`
        Pop $0
      ${EndIf}
      Sleep 1000
    ${EndIf}

    ${If} $2 > 6
      # Probably running with more rights than this setup, or locked by something else.
      ${If} ${isUpdated}
      ${OrIf} ${Silent}
        SetErrorLevel 2
        Quit
      ${EndIf}
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY +2
      Quit
      StrCpy $2 2
    ${EndIf}
  ${Loop}

  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend
