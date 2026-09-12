param(
  [string]$DoctlPath = 'doctl',
  [string]$Since = '2026-09-01',
  [string]$OutputPath = '.cache/do-history.jsonl'
)
$ErrorActionPreference = 'Stop'
$appId = 'ec889e34-efbf-4fc4-9213-931f6d7d5373'
$invocations = (& $DoctlPath apps list-job-invocations $appId -o json | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) { throw 'Could not read publisher invocations' }
$fields = @('event','stage','targetDate','model','responseModel','promptVersion','reasoningEffort','reasoningTokens',
  'responseId','requestId','inputTokens','outputTokens','webSearchCalls',
  'attempts','attempt','providerAttempts','durationMs','attemptDurationMs',
  'timeoutMs','softTimeoutMs','timeoutSource','httpStatus','code','slot')
$history = foreach ($invocation in $invocations | Where-Object { $_.started_at -ge $Since }) {
  $component = if ($invocation.job_name -in @('publish-daily','collect-news')) { $invocation.job_name } else { 'publish-daily' }
  $lines = & $DoctlPath apps logs $appId $component --job-invocation $invocation.id --no-prefix
  if ($LASTEXITCODE -ne 0) { throw "Could not read invocation $($invocation.id)" }
  $records = @($lines | ForEach-Object {
    $position = $_.IndexOf('{')
    if ($position -ge 0) {
      try {
        $record = $_.Substring($position) | ConvertFrom-Json
        if ($record.event -in @('generation_stage_complete','generation_failed','publisher_job_failed','generation_retry')) {
          $safeRecord = [ordered]@{}
          foreach ($field in $fields) {
            if ($null -ne $record.$field) { $safeRecord[$field] = $record.$field }
          }
          $safeRecord
        }
      } catch { }
    }
  })
  if ($records.Count -gt 0) {
    @{ startedAt = $invocation.started_at; records = $records } | ConvertTo-Json -Depth 6 -Compress
  }
}
$parent = Split-Path -Parent $OutputPath
if ($parent) { New-Item -ItemType Directory -Force $parent | Out-Null }
$history | Set-Content -LiteralPath $OutputPath -Encoding utf8
Write-Output "Saved $($history.Count) invocation records to $OutputPath"
