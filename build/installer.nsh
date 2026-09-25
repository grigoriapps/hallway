; Правило брандмауэра Windows для входящих UDP (discovery) и TCP (чат, файлы).
; Без него Windows либо показывает диалог при первом запуске, либо (если нажать
; «Отмена») создаёт БЛОКИРУЮЩЕЕ правило — и Mac перестаёт видеть Windows-клиента.
; Удаление по имени заодно убирает такие автоматически созданные блокирующие правила.

!macro customInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Hallway"'
  nsExec::ExecToLog 'netsh advfirewall firewall add rule name="Hallway" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" enable=yes profile=any'
!macroend

!macro customUnInstall
  nsExec::ExecToLog 'netsh advfirewall firewall delete rule name="Hallway"'
!macroend
