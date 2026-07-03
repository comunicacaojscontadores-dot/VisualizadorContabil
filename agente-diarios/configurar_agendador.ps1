# Configura o Agendador de Tarefas do Windows para rodar o agente Seg-Sex às 7:50
# Execute este script UMA VEZ como Administrador

$caminhoBat = "C:\Users\01-comunicação\Documents\Programas em Desenvolvimento\visualizadorcontbil-main\agente-diarios\rodar_agente.bat"
$pastaLogs  = "C:\Users\01-comunicação\Documents\Programas em Desenvolvimento\visualizadorcontbil-main\agente-diarios\logs"

# Cria pasta de logs se não existir
if (-not (Test-Path $pastaLogs)) {
    New-Item -ItemType Directory -Path $pastaLogs | Out-Null
    Write-Host "Pasta de logs criada: $pastaLogs"
}

# Define a ação
$acao = New-ScheduledTaskAction `
    -Execute "cmd.exe" `
    -Argument "/c `"$caminhoBat`""

# Define o gatilho: Seg-Sex às 7:50
$gatilho = New-ScheduledTaskTrigger -Weekly -At "07:50" -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday

# Configurações
$config = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable

# Registra a tarefa
Register-ScheduledTask `
    -TaskName "AgenteResumoDiarios" `
    -Description "Coleta e resume diários oficiais MG/RJ/ES/SP/DOU" `
    -Action $acao `
    -Trigger $gatilho `
    -Settings $config `
    -RunLevel Highest `
    -Force

Write-Host ""
Write-Host "Tarefa 'AgenteResumoDiarios' criada com sucesso!"
Write-Host "Executa de segunda a sexta às 07:50."
Write-Host "Para rodar agora: Start-ScheduledTask -TaskName 'AgenteResumoDiarios'"
