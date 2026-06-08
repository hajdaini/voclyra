!include LogicLib.nsh
!include nsDialogs.nsh

!ifndef BUILD_UNINSTALLER
Var VoclyraLaunchAtStartupCheckbox
Var VoclyraLaunchAtStartupState

!macro customPageAfterChangeDir
  Page custom VoclyraStartupOptionsPage VoclyraStartupOptionsLeave
!macroend

Function VoclyraStartupOptionsPage
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateCheckbox} 0 12u 100% 12u "Launch Voclyra at startup"
  Pop $VoclyraLaunchAtStartupCheckbox
  ${NSD_SetState} $VoclyraLaunchAtStartupCheckbox ${BST_UNCHECKED}
  nsDialogs::Show
FunctionEnd

Function VoclyraStartupOptionsLeave
  ${NSD_GetState} $VoclyraLaunchAtStartupCheckbox $VoclyraLaunchAtStartupState
FunctionEnd

!macro customInstall
  ${If} $VoclyraLaunchAtStartupState == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_FILENAME}" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  ${EndIf}
!macroend
!endif

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${PRODUCT_FILENAME}"
  ${IfNot} ${Silent}
    MessageBox MB_YESNO|MB_ICONQUESTION "Also delete Voclyra user data from $PROFILE\.voclyra? This removes settings, history, logs, models, and saved audio." IDNO +2
      RMDir /r "$PROFILE\.voclyra"
  ${EndIf}
!macroend
