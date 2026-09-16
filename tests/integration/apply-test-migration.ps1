param([Parameter(Mandatory=$true)][ValidatePattern('^202609[0-9]{8}$')][string]$Version)
$ErrorActionPreference = 'Stop'
$testRef = 'ezlycwkuzkwcnhrhiruv'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$matches = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'supabase/migrations') -Filter "$Version`_*.sql")
if ($matches.Count -ne 1) { throw 'Exactly one versioned migration is required.' }
$migration = $matches[0]
$name = $migration.BaseName.Substring(15)
if ($name -notmatch '^[a-z0-9_]+$') { throw 'Invalid migration name.' }
$source = [IO.File]::ReadAllText($migration.FullName)
if ($source -notmatch '(?is)^\s*(?:--[^\n]*\n\s*)*begin;' -or $source -notmatch '(?is)commit;\s*$') { throw 'Migration must be explicitly transactional.' }
$existing = & npx supabase db query --linked --project-ref $testRef --output json "select version from supabase_migrations.schema_migrations where version='$Version';"
if ($LASTEXITCODE -ne 0) { throw 'Could not check Test migration history.' }
$history = ($existing -join "`n") | ConvertFrom-Json
if ($history.rows.Count -gt 0) { Write-Output "Already applied in Test: $Version"; exit 0 }
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($source))
$record = "insert into supabase_migrations.schema_migrations(version,name,statements) values ('$Version','$name',array[convert_from(decode('$encoded','base64'),'UTF8')]);`nnotify pgrst, 'reload schema';`ncommit;"
$sql = [regex]::Replace($source, '(?is)commit;\s*$', [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $record })
$sqlPath = Join-Path ([IO.Path]::GetTempPath()) ("filmatta-test-migration-" + [guid]::NewGuid() + '.sql')
try {
  [IO.File]::WriteAllText($sqlPath,$sql)
  & npx supabase db query --linked --project-ref $testRef --file $sqlPath --output json
  if ($LASTEXITCODE -ne 0) { throw "Migration failed in Test: $Version" }
  Write-Output "Applied in Test $testRef : $($migration.Name)"
} finally { Remove-Item -LiteralPath $sqlPath -ErrorAction SilentlyContinue }
